import "server-only";
import {
  Document,
  Page,
  Path,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { AccountingReport, JournalRow } from "./accounting";
import { site } from "./site";
import { formatDayLong, formatPrice, monthName, zurichDay, zurichTime } from "./time";

/**
 * Leistungsjournal als PDF — dieselben Zahlen wie die Seite und das CSV,
 * nur zum Ablegen oder Weiterreichen an ein Treuhandbüro.
 *
 * Eingebettete Schriften brauchen eine TTF-Datei; die Website liefert ihre
 * eigene Schrift nur als woff2 aus. Statt sie eigens zu konvertieren, nutzt
 * das PDF die eingebauten PDF-Schriften Helvetica und Courier — Courier für
 * Zahlen, Zeiten und Referenzen greift dieselbe Idee der Schreibmaschinen-
 * ziffern auf, die auf der Website die Klasse "nums" übernimmt.
 *
 * Farben sind als literale Werte übernommen, nicht aus globals.css gelesen:
 * ein PDF-Renderer läuft ausserhalb des Browsers und kennt keine CSS-
 * Bezeichner. Wer die Markenfarben ändert, muss sie hier von Hand nachziehen.
 */

const COLOR = {
  signal: "#FF312E",
  deep: "#000103",
  paper: "#FFFFFA",
  slate: "#515052",
  rule: "#CBCBC8",
  concrete: "#F5F5F1",
  amberInk: "#7A5312",
  amberTint: "#FBF1E1",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 96,
    paddingBottom: 56,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: COLOR.deep,
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 72,
    backgroundColor: COLOR.deep,
    paddingHorizontal: 40,
    flexDirection: "row",
    alignItems: "center",
  },
  logo: {
    marginRight: 10,
  },
  headerName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 15,
    color: COLOR.paper,
  },
  headerClaim: {
    fontSize: 8,
    color: COLOR.paper,
    opacity: 0.65,
    marginTop: 1,
  },
  headerRight: {
    marginLeft: "auto",
    alignItems: "flex-end",
  },
  headerTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    color: COLOR.paper,
  },
  headerPeriod: {
    fontFamily: "Courier",
    fontSize: 9,
    color: COLOR.paper,
    opacity: 0.8,
    marginTop: 1,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: COLOR.slate,
    borderTopWidth: 1,
    borderTopColor: COLOR.rule,
    paddingTop: 6,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  metaBlock: {
    fontSize: 8.5,
    color: COLOR.slate,
    lineHeight: 1.5,
  },
  metaLabel: {
    fontFamily: "Helvetica-Bold",
    color: COLOR.deep,
    marginBottom: 2,
  },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    marginBottom: 10,
    marginTop: 4,
  },
  tileRow: {
    flexDirection: "row",
    marginBottom: 18,
  },
  tile: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLOR.rule,
    padding: 10,
    marginRight: 8,
  },
  tileLast: {
    marginRight: 0,
  },
  tileLabel: {
    fontSize: 7.5,
    color: COLOR.slate,
    marginBottom: 5,
  },
  tileValue: {
    fontFamily: "Courier-Bold",
    fontSize: 13,
  },
  tileHint: {
    fontSize: 7,
    color: COLOR.slate,
    marginTop: 3,
  },
  notice: {
    fontSize: 8,
    color: COLOR.slate,
    lineHeight: 1.5,
    marginBottom: 22,
  },
  summaryTable: {
    marginBottom: 22,
  },
  summaryRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLOR.rule,
    paddingVertical: 5,
  },
  summaryRowHead: {
    borderBottomWidth: 1.5,
    borderBottomColor: COLOR.deep,
    paddingBottom: 4,
  },
  summaryName: {
    flex: 1,
  },
  summaryNameHead: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: COLOR.slate,
    textTransform: "uppercase",
  },
  summaryCount: {
    width: 70,
    fontFamily: "Courier",
    textAlign: "right",
  },
  summaryAmount: {
    width: 80,
    fontFamily: "Courier-Bold",
    textAlign: "right",
  },
  journalHead: {
    flexDirection: "row",
    backgroundColor: COLOR.deep,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  journalHeadCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: COLOR.paper,
    textTransform: "uppercase",
  },
  journalRow: {
    flexDirection: "row",
    paddingVertical: 4.5,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: COLOR.rule,
  },
  journalRowAlt: {
    backgroundColor: COLOR.concrete,
  },
  colDate: { width: 60, fontFamily: "Courier" },
  colTime: { width: 34, fontFamily: "Courier" },
  colRef: { width: 62, fontFamily: "Courier" },
  colOffer: { flex: 1.3 },
  colStaff: { flex: 1 },
  // Ohne flex: in der senkrechten Spalte des Angebots liess flex: 1 die
  // zweite Zeile auf null Höhe schrumpfen, sie ragte in die nächste Zeile.
  colPromo: { color: COLOR.slate, fontSize: 8, marginTop: 1 },
  colAmount: { width: 58, fontFamily: "Courier-Bold", textAlign: "right" },
  totalRow: {
    flexDirection: "row",
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderTopWidth: 1.5,
    borderTopColor: COLOR.deep,
    marginTop: 2,
  },
  totalLabel: {
    flex: 1,
    fontFamily: "Helvetica-Bold",
    fontSize: 9.5,
  },
  totalAmount: {
    width: 58,
    fontFamily: "Courier-Bold",
    fontSize: 10.5,
    textAlign: "right",
  },
  pageIntro: {
    fontSize: 8.5,
    color: COLOR.slate,
    lineHeight: 1.5,
    marginBottom: 16,
  },
});

function HeaderBand({ title, period }: { title: string; period: string }) {
  return (
    <View style={styles.header} fixed>
      <Svg width={26} height={26} viewBox="0 0 24 24" style={styles.logo}>
        <Rect x={0} y={0} width={24} height={24} rx={6} fill={COLOR.signal} />
        <Path d="M12 5.2 18.8 12 12 18.8 5.2 12z" fill={COLOR.paper} />
      </Svg>
      <View>
        <Text style={styles.headerName}>{site.name}</Text>
        <Text style={styles.headerClaim}>{site.claim}</Text>
      </View>
      <View style={styles.headerRight}>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerPeriod}>{period}</Text>
      </View>
    </View>
  );
}

function Footer({ generatedAt }: { generatedAt: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>{generatedAt}</Text>
      <Text render={({ pageNumber, totalPages }) => `Seite ${pageNumber} von ${totalPages}`} />
    </View>
  );
}

function journalHeadRow() {
  return (
    <View style={styles.journalHead} fixed>
      <Text style={[styles.journalHeadCell, styles.colDate]}>Datum</Text>
      <Text style={[styles.journalHeadCell, styles.colTime]}>Zeit</Text>
      <Text style={[styles.journalHeadCell, styles.colRef]}>Referenz</Text>
      <Text style={[styles.journalHeadCell, styles.colOffer]}>Angebot</Text>
      <Text style={[styles.journalHeadCell, styles.colStaff]}>Fahrlehrerin</Text>
      <Text style={[styles.journalHeadCell, styles.colAmount]}>Betrag</Text>
    </View>
  );
}

function journalDataRow(row: JournalRow, index: number) {
  return (
    <View
      key={row.reference}
      style={[styles.journalRow, index % 2 === 1 ? styles.journalRowAlt : undefined]}
      wrap={false}
    >
      <Text style={styles.colDate}>{formatDayShort(row.day)}</Text>
      <Text style={styles.colTime}>{row.time}</Text>
      <Text style={styles.colRef}>{row.reference}</Text>
      <View style={styles.colOffer}>
        <Text>{row.lessonName}</Text>
        {row.promotionLabel && <Text style={styles.colPromo}>{row.promotionLabel}</Text>}
        {row.reason && <Text style={styles.colPromo}>{row.reason}</Text>}
      </View>
      <Text style={styles.colStaff}>{row.staffName}</Text>
      <Text style={styles.colAmount}>{formatPrice(row.amountRappen)}</Text>
    </View>
  );
}

function formatDayShort(day: string): string {
  return `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;
}

export async function renderAccountingPdf(
  report: AccountingReport,
  year: number,
  month: number | undefined,
): Promise<Buffer> {
  const period = month ? `${monthName(month)} ${year}` : `Jahr ${year}`;
  const now = new Date();
  const generatedAt = `Erstellt am ${formatDayLong(zurichDay(now))}, ${zurichTime(now)} Uhr`;
  const issuer = `${site.legalName}\n${site.contact.street}\n${site.contact.zip} ${site.contact.city}`;

  const doc = (
    <Document
      title={`DriveOnPoint — Leistungsjournal ${period}`}
      author={site.legalName}
      subject="Leistungsjournal"
    >
      {/* --- Seite 1: Übersicht ------------------------------------------ */}
      <Page size="A4" style={styles.page}>
        <HeaderBand title="Leistungsjournal" period={period} />

        <View style={styles.metaRow}>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Ausgestellt von</Text>
            <Text>{issuer}</Text>
          </View>
          <View style={[styles.metaBlock, { textAlign: "right" }]}>
            <Text style={styles.metaLabel}>Zeitraum</Text>
            <Text>{period}</Text>
            <Text style={{ marginTop: 6 }}>{generatedAt}</Text>
          </View>
        </View>

        <View style={styles.tileRow}>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>UMSATZ {period.toUpperCase()}</Text>
            <Text style={styles.tileValue}>CHF {formatPrice(report.totalRappen)}</Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>ERBRACHTE TERMINE</Text>
            <Text style={styles.tileValue}>{report.rows.length}</Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>NOCH AUSSTEHEND</Text>
            <Text style={styles.tileValue}>
              {report.openCount === 0 ? "—" : `CHF ${formatPrice(report.openRappen)}`}
            </Text>
            {report.openCount > 0 && <Text style={styles.tileHint}>{report.openCount} gebucht</Text>}
          </View>
          <View style={[styles.tile, styles.tileLast]}>
            <Text style={styles.tileLabel}>VERRECHENBARE AUSFÄLLE</Text>
            <Text style={styles.tileValue}>
              {report.chargeable.length === 0
                ? "—"
                : `CHF ${formatPrice(report.chargeableRappen)}`}
            </Text>
            {report.chargeable.length > 0 && (
              <Text style={styles.tileHint}>{report.chargeable.length} Stück, nicht im Umsatz</Text>
            )}
          </View>
        </View>

        <Text style={styles.notice}>
          Leistungsjournal, keine Zahlungsübersicht: erfasst ist, was stattgefunden hat, nicht ob
          bezahlt wurde — bezahlt wird per TWINT, Karte oder Rechnung ausserhalb der Website. Für
          die Steuererklärung gehört dieser Auszug mit den tatsächlichen Zahlungseingängen
          abgeglichen. Belege sind nach Artikel 958f OR zehn Jahre aufzubewahren; die Website
          selbst löscht die Personendaten der Kundschaft schon nach 30 Tagen — dieses Journal
          enthält deshalb bewusst keine.
        </Text>

        {!month && report.byMonth.length > 0 && (
          <View style={styles.summaryTable}>
            <Text style={styles.sectionTitle}>Nach Monat</Text>
            <View style={[styles.summaryRow, styles.summaryRowHead]}>
              <Text style={[styles.summaryName, styles.summaryNameHead]}>Monat</Text>
              <Text style={[styles.summaryCount, styles.summaryNameHead]}>Termine</Text>
              <Text style={[styles.summaryAmount, styles.summaryNameHead]}>CHF</Text>
            </View>
            {report.byMonth.map((entry) => (
              <View key={entry.month} style={styles.summaryRow}>
                <Text style={styles.summaryName}>{monthName(entry.month)}</Text>
                <Text style={styles.summaryCount}>{entry.count}</Text>
                <Text style={styles.summaryAmount}>{formatPrice(entry.totalRappen)}</Text>
              </View>
            ))}
          </View>
        )}

        {report.byLessonType.length > 0 && (
          <View style={styles.summaryTable}>
            <Text style={styles.sectionTitle}>Nach Angebot</Text>
            <View style={[styles.summaryRow, styles.summaryRowHead]}>
              <Text style={[styles.summaryName, styles.summaryNameHead]}>Angebot</Text>
              <Text style={[styles.summaryCount, styles.summaryNameHead]}>Termine</Text>
              <Text style={[styles.summaryAmount, styles.summaryNameHead]}>CHF</Text>
            </View>
            {report.byLessonType.map((entry) => (
              <View key={entry.name} style={styles.summaryRow}>
                <Text style={styles.summaryName}>{entry.name}</Text>
                <Text style={styles.summaryCount}>{entry.count}</Text>
                <Text style={styles.summaryAmount}>{formatPrice(entry.totalRappen)}</Text>
              </View>
            ))}
          </View>
        )}

        <Footer generatedAt={generatedAt} />
      </Page>

      {/* --- Journal, seitenweise mit wiederkehrender Kopfzeile ----------- */}
      {report.rows.length > 0 && (
        <Page size="A4" style={styles.page} wrap>
          <HeaderBand title="Journal" period={period} />
          <Text style={styles.sectionTitle}>Einzelne Termine</Text>
          {journalHeadRow()}
          {report.rows.map((row, index) => journalDataRow(row, index))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Summe</Text>
            <Text style={styles.totalAmount}>{formatPrice(report.totalRappen)}</Text>
          </View>
          <Footer generatedAt={generatedAt} />
        </Page>
      )}

      {/* --- Verrechenbare Ausfälle, eigene Seite -------------------------- */}
      {report.chargeable.length > 0 && (
        <Page size="A4" style={styles.page} wrap>
          <HeaderBand title="Verrechenbare Ausfälle" period={period} />
          <Text style={styles.sectionTitle}>Kurzfristige Absagen und nicht erschienen</Text>
          <Text style={styles.pageIntro}>
            Innert 24 Stunden vor Beginn von der Kundschaft abgesagt oder nicht erschienen und laut
            AGB verrechenbar, im Umsatz auf Seite 1 aber nicht mitgezählt. Absagen durch die
            Fahrschule stehen hier nicht.
          </Text>
          {journalHeadRow()}
          {report.chargeable.map((row, index) => journalDataRow(row, index))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Summe verrechenbare Ausfälle</Text>
            <Text style={styles.totalAmount}>{formatPrice(report.chargeableRappen)}</Text>
          </View>
          <Footer generatedAt={generatedAt} />
        </Page>
      )}
    </Document>
  );

  return renderToBuffer(doc);
}
