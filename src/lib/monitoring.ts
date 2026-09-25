import "server-only";
import { readChecks, setAlertedAt } from "./checks";
import { env } from "./env";
import { escapeHtml, mailLayout, sendMail } from "./mail";
import { site } from "./site";

/**
 * Merkt, wenn etwas stillsteht.
 *
 * Der Mailversand und die beiden Cron-Läufe notieren Erfolg und Fehler
 * (checks.ts). Hier wird daraus eine Liste von Problemen: in der
 * Team-Übersicht als Hinweis, per Mail an die Fahrschule und unter
 * /api/betrieb für einen externen Monitor.
 *
 * Die Mail allein genügt nicht — ist der Mailversand selbst gestört, kommt
 * auch die Warnung nicht an. Deshalb steht dasselbe in der Team-Übersicht.
 */

export type Problem = {
  key: "mail" | "stuendlich" | "aufraeumen";
  title: string;
  detail: string;
};

const HOUR = 60 * 60 * 1000;

/** Wie lange ein Cron-Lauf ausbleiben darf, bevor es auffällt. */
const STALE_AFTER: Record<"stuendlich" | "aufraeumen", number> = {
  stuendlich: 3 * HOUR,
  aufraeumen: 30 * HOUR,
};

const CRON_LABEL = {
  stuendlich: "Der stündliche Lauf (Erinnerungen, verfallene Anfragen, Wartelisten)",
  aufraeumen: "Der tägliche Aufräumlauf (Löschen von Kundendaten nach 30 Tagen)",
};

/** Eine Warnung höchstens so oft wiederholen, solange das Problem besteht. */
const REPEAT_ALERT_AFTER = 12 * HOUR;

function formatWhen(at: Date): string {
  return at.toLocaleString("de-CH", {
    timeZone: "Europe/Zurich",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function currentProblems(now: Date = new Date()): Promise<Problem[]> {
  const rows = new Map((await readChecks()).map((row) => [row.key, row]));
  const problems: Problem[] = [];

  const failing = (row: { lastOkAt: Date | null; lastErrorAt: Date | null } | undefined) =>
    !!row?.lastErrorAt && (!row.lastOkAt || row.lastErrorAt > row.lastOkAt);

  const mail = rows.get("mail");
  if (mail && failing(mail)) {
    problems.push({
      key: "mail",
      title: "Mailversand gestört",
      detail: `Seit ${formatWhen(mail.lastErrorAt!)} konnte keine Mail verschickt werden. Buchungsbestätigungen, Erinnerungen und Wartelisten-Mails kommen nicht an. Fehler: ${mail.lastError ?? "unbekannt"}`,
    });
  }

  // Direkt nach dem Start hat der Lauf noch keine Gelegenheit gehabt —
  // sonst meldete jede frische Installation sofort einen Ausfall.
  const uptime = process.uptime() * 1000;

  for (const key of ["stuendlich", "aufraeumen"] as const) {
    const row = rows.get(key);
    const limit = STALE_AFTER[key];
    if (!row?.lastOkAt) {
      if (uptime > limit && !failing(row)) {
        problems.push({
          key,
          title: `${key === "stuendlich" ? "Stündlicher" : "Täglicher"} Lauf fehlt`,
          detail: `${CRON_LABEL[key]} ist noch nie gelaufen. Wahrscheinlich ist der Cron-Eintrag auf dem Server nicht eingerichtet (sudo deploy/install-cron.sh).`,
        });
      }
    } else if (now.getTime() - row.lastOkAt.getTime() > limit) {
      problems.push({
        key,
        title: `${key === "stuendlich" ? "Stündlicher" : "Täglicher"} Lauf steht still`,
        detail: `${CRON_LABEL[key]} ist zuletzt am ${formatWhen(row.lastOkAt)} erfolgreich gelaufen.`,
      });
      continue;
    }
    if (failing(row)) {
      problems.push({
        key,
        title: `${key === "stuendlich" ? "Stündlicher" : "Täglicher"} Lauf schlägt fehl`,
        detail: `${CRON_LABEL[key]} ist am ${formatWhen(row!.lastErrorAt!)} fehlgeschlagen. Fehler: ${row!.lastError ?? "unbekannt"}`,
      });
    }
  }

  return problems;
}

export function alertRecipient(): string {
  return process.env.ALERT_EMAIL || site.contact.email;
}

/**
 * Schickt eine Warnung, sobald etwas nicht stimmt, und eine Entwarnung, wenn
 * es wieder läuft. Solange das Problem besteht, höchstens alle 12 Stunden
 * erneut. Wirft nie.
 */
export async function checkAndAlert(now: Date = new Date()): Promise<void> {
  try {
    const problems = await currentProblems(now);
    const alarm = (await readChecks()).find((row) => row.key === "alarm");
    const alertedAt = alarm?.alertedAt ?? null;

    if (problems.length > 0) {
      if (alertedAt && now.getTime() - alertedAt.getTime() < REPEAT_ALERT_AFTER) return;
      await sendMail({
        to: alertRecipient(),
        subject: `Website: ${problems.map((problem) => problem.title).join(", ")}`,
        text: [
          "Auf der Website läuft etwas nicht wie vorgesehen:",
          "",
          ...problems.flatMap((problem) => [`${problem.title}`, problem.detail, ""]),
          `Die Team-Übersicht zeigt den aktuellen Stand: ${env.appUrl}/team`,
          "",
          "Diese Mail kommt erneut, solange das Problem besteht, höchstens alle 12 Stunden.",
        ].join("\n"),
        html: mailLayout(
          "Auf der Website läuft etwas nicht",
          `${problems
            .map(
              (problem) =>
                `<p style="margin:0 0 16px;"><strong>${escapeHtml(problem.title)}</strong><br>${escapeHtml(problem.detail)}</p>`,
            )
            .join("\n")}
<p style="margin:0 0 16px;">Den aktuellen Stand zeigt die <a href="${escapeHtml(env.appUrl)}/team">Team-Übersicht</a>.</p>
<p style="margin:0;color:#515052;font-size:14px;">Diese Mail kommt erneut, solange das Problem besteht, höchstens alle 12 Stunden.</p>`,
        ),
      });
      await setAlertedAt(now);
      return;
    }

    if (alertedAt) {
      await sendMail({
        to: alertRecipient(),
        subject: "Website: wieder alles in Ordnung",
        text: "Die zuletzt gemeldeten Probleme auf der Website sind behoben. Es ist nichts weiter zu tun.",
        html: mailLayout(
          "Wieder alles in Ordnung",
          `<p style="margin:0;">Die zuletzt gemeldeten Probleme auf der Website sind behoben. Es ist nichts weiter zu tun.</p>`,
        ),
      });
      await setAlertedAt(null);
    }
  } catch (error) {
    // Ist der Mailversand gestört, scheitert auch die Warnung. Die
    // Team-Übersicht zeigt das Problem trotzdem an.
    console.error("Betriebswarnung konnte nicht verschickt werden:", error);
  }
}

const globalForWatchdog = globalThis as unknown as { __dopWatchdog?: NodeJS.Timeout };

/**
 * Prüft alle 15 Minuten. Läuft im Anwendungsprozess selbst, nicht über Cron —
 * sonst bliebe genau der Fall unbemerkt, dass der Cron-Eintrag fehlt.
 */
export function startWatchdog(): void {
  if (globalForWatchdog.__dopWatchdog) return;
  const timer = setInterval(() => void checkAndAlert(), 15 * 60 * 1000);
  // Hält den Prozess beim Beenden nicht künstlich am Leben.
  timer.unref();
  globalForWatchdog.__dopWatchdog = timer;
}
