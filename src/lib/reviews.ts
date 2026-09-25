import "server-only";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { sendReviewRequest } from "./booking-mail";
import { courseSession } from "./course-cancel";
import { db } from "./db";
import { bookings, lessonTypes } from "./db/schema";
import { env } from "./env";

/**
 * Bitte um eine Google-Bewertung — vom Team ausgelöst, nach dem letzten
 * Kursabend oder rund um die Prüfungsfahrt. Das System weiss nicht, wann
 * eine Ausbildung fertig ist, deshalb läuft hier nichts automatisch.
 *
 * Eine solche Mail ist Werbung (UWG Art. 3 Abs. 1 lit. o). Sie geht nur an
 * Kundschaft, die bei der Buchung das freiwillige Häkchen gesetzt hat, und
 * an jede Mailadresse höchstens einmal.
 */

export type ReviewOutcome = {
  sent: number;
  noConsent: number;
  noEmail: number;
  alreadyAsked: number;
  notEligible: number;
  failed: number;
};

type Candidate = {
  id: string;
  status: string;
  startsAt: Date;
  noShowAt: Date | null;
  reviewConsent: boolean;
  reviewRequestedAt: Date | null;
  customerName: string | null;
  customerEmail: string | null;
  lessonName: string | null;
};

/** Kann für diese Buchung überhaupt angefragt werden? Für die Anzeige im Kalender. */
export function reviewAskable(entry: {
  status: string;
  startsAt: Date;
  noShowAt: Date | null;
  reviewConsent: boolean;
  reviewRequestedAt: Date | null;
  customerEmail: string | null;
}): boolean {
  return (
    !!env.googleReviewUrl &&
    entry.status === "bestaetigt" &&
    entry.startsAt.getTime() <= Date.now() &&
    !entry.noShowAt &&
    entry.reviewConsent &&
    !entry.reviewRequestedAt &&
    !!entry.customerEmail
  );
}

async function candidates(ids: string[]): Promise<Candidate[]> {
  if (ids.length === 0) return [];
  return db
    .select({
      id: bookings.id,
      status: bookings.status,
      startsAt: bookings.startsAt,
      noShowAt: bookings.noShowAt,
      reviewConsent: bookings.reviewConsent,
      reviewRequestedAt: bookings.reviewRequestedAt,
      customerName: bookings.customerName,
      customerEmail: bookings.customerEmail,
      lessonName: lessonTypes.name,
    })
    .from(bookings)
    .leftJoin(lessonTypes, eq(lessonTypes.id, bookings.lessonTypeId))
    .where(inArray(bookings.id, ids));
}

export async function requestReviews(bookingIds: string[]): Promise<ReviewOutcome> {
  const outcome: ReviewOutcome = {
    sent: 0,
    noConsent: 0,
    noEmail: 0,
    alreadyAsked: 0,
    notEligible: 0,
    failed: 0,
  };
  const reviewUrl = env.googleReviewUrl;
  if (!reviewUrl) return outcome;

  const rows = await candidates(bookingIds);

  // Wer schon einmal gefragt wurde — über alle Buchungen derselben Adresse.
  const emails = [...new Set(rows.map((row) => row.customerEmail?.trim().toLowerCase()).filter(Boolean))] as string[];
  const asked = new Set(
    emails.length === 0
      ? []
      : (
          await db
            .select({ email: sql<string>`lower(${bookings.customerEmail})` })
            .from(bookings)
            .where(
              and(
                isNotNull(bookings.reviewRequestedAt),
                inArray(sql`lower(${bookings.customerEmail})`, emails),
              ),
            )
        ).map((row) => row.email),
  );

  for (const row of rows) {
    const email = row.customerEmail?.trim().toLowerCase();
    if (row.status !== "bestaetigt" || row.startsAt.getTime() > Date.now() || row.noShowAt) {
      outcome.notEligible += 1;
      continue;
    }
    if (!row.reviewConsent) {
      outcome.noConsent += 1;
      continue;
    }
    if (!email) {
      outcome.noEmail += 1;
      continue;
    }
    if (row.reviewRequestedAt || asked.has(email)) {
      outcome.alreadyAsked += 1;
      continue;
    }

    try {
      await sendReviewRequest({
        to: row.customerEmail!,
        name: row.customerName ?? "",
        lessonName: row.lessonName ?? "Termin",
        reviewUrl,
      });
      await db.update(bookings).set({ reviewRequestedAt: new Date() }).where(eq(bookings.id, row.id));
      asked.add(email);
      outcome.sent += 1;
    } catch (error) {
      console.error("Bewertungsanfrage konnte nicht versendet werden:", error);
      outcome.failed += 1;
    }
  }

  return outcome;
}

/** Alle Teilnehmenden eines Kurstermins — ausgelöst von einer seiner Buchungen. */
export async function requestCourseReviews(bookingId: string): Promise<ReviewOutcome | null> {
  const [entry] = await db
    .select({ lessonTypeId: bookings.lessonTypeId, startsAt: bookings.startsAt })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!entry?.lessonTypeId) return null;
  const { lessonType, participants } = await courseSession(entry.lessonTypeId, entry.startsAt);
  if (!lessonType || lessonType.capacity <= 1) return null;
  return requestReviews(participants.map((participant) => participant.id));
}
