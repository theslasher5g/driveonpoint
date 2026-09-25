/**
 * Wie weit Kurstermine buchbar sind und wie viele die Buchungsseite zeigt.
 * Eigene Datei ohne Datenbank, damit auch das Formular im Browser sie kennt.
 *
 * Fahrstunden lassen sich 4 Wochen voraus buchen (BOOKING_HORIZON_DAYS in
 * booking.ts). Kurse finden seltener statt, etwa einmal im Monat — mit
 * 4 Wochen wäre oft nur einer zu sehen. Sie sind deshalb ein Jahr voraus
 * buchbar, angezeigt werden die nächsten paar.
 */
export const COURSE_HORIZON_DAYS = 366;
export const COURSE_SESSIONS_SHOWN = 4;
