import { accountingReport, type JournalRow } from "@/lib/accounting";
import { can } from "@/lib/auth/permissions";
import { currentUser } from "@/lib/auth/session";
import { formatPrice } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Journal als CSV, für die Steuererklärung oder das Treuhandbüro.
 *
 * Semikolon als Trennzeichen und eine Byte-Reihenfolge-Marke am Anfang:
 * Excel öffnet die Datei sonst als eine einzige Spalte und zeigt Umlaute
 * falsch an.
 */
function csvCell(value: string | number): string {
  const text = String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: JournalRow[], heading: string): string[] {
  return [
    heading,
    ...rows.map((row) =>
      [
        row.day,
        row.time,
        row.reference,
        row.lessonName,
        row.staffName,
        formatPrice(row.amountRappen),
        row.promotionLabel ?? "",
      ]
        .map(csvCell)
        .join(";"),
    ),
  ];
}

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user || !can(user.role, "buchhaltung.ansehen")) {
    return new Response("Nicht berechtigt", { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const year = Number(params.get("jahr"));
  const monthRaw = params.get("monat");
  const month = monthRaw ? Number(monthRaw) : undefined;

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return new Response("Ungültiges Jahr", { status: 400 });
  }
  if (month !== undefined && (!Number.isInteger(month) || month < 1 || month > 12)) {
    return new Response("Ungültiger Monat", { status: 400 });
  }

  const report = await accountingReport(year, month);
  const label = month ? `${year}-${String(month).padStart(2, "0")}` : String(year);

  const lines = [
    `# DriveOnPoint — Leistungsjournal ${label}`,
    "# Erbrachte, nicht abgesagte Termine. Ohne Angaben zur Kundschaft.",
    "",
    ...toCsv(report.rows, "Datum;Zeit;Referenz;Angebot;Fahrlehrerin;Betrag CHF;Aktion"),
    "",
    `Summe;;;;;${formatPrice(report.totalRappen)};`,
  ];

  if (report.lateCancellations.length > 0) {
    lines.push(
      "",
      "# Absagen innert 24 Stunden vor Beginn — laut AGB verrechenbar,",
      "# oben nicht mitgezählt. Absagen durch die Fahrschule selbst stehen",
      "# hier ebenfalls und gehören von Hand aussortiert.",
      ...toCsv(report.lateCancellations, "Datum;Zeit;Referenz;Angebot;Fahrlehrerin;Betrag CHF;Aktion"),
      `Summe kurzfristige Absagen;;;;;${formatPrice(report.lateCancelledRappen)};`,
    );
  }

  // ﻿ ist die Byte-Reihenfolge-Marke, \r\n das Zeilenende, mit dem
  // Tabellenprogramme unter Windows zuverlässig umgehen.
  const body = `﻿${lines.join("\r\n")}\r\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="driveonpoint-journal-${label}.csv"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
