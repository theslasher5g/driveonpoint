import { accountingReport } from "@/lib/accounting";
import { renderAccountingPdf } from "@/lib/accounting-pdf";
import { can } from "@/lib/auth/permissions";
import { currentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

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
  const pdf = await renderAccountingPdf(report, year, month);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="driveonpoint-journal-${label}.pdf"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
