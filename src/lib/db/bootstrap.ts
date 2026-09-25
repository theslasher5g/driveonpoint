import { existsSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { hash as argonHash } from "@node-rs/argon2";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index";
import { lessonTypes, pricePackages, staff, staffLessonTypes } from "./schema";

/**
 * Bringt die Datenbank beim Serverstart auf Stand.
 *
 * Damit genügt zum Aufschalten ein `docker compose up -d --build`. Das
 * Auslieferungsimage enthält weder Quellcode noch tsx, ein getrennter
 * Migrationsbefehl liesse sich darin also gar nicht ausführen.
 *
 * Alles hier ist mehrfach ausführbar: bestehende Angebote werden nicht
 * überschrieben, und ein zweites Administrationskonto entsteht nicht.
 */

const LOCK_KEY = 4_919_233_071;

/**
 * Die buchbaren Angebote mit den Preisen der bestehenden Seite.
 *
 * Bei den Kursen ist `durationMinutes` nur ein Vorschlag fürs Formular: die
 * Zeiten kommen aus dem eingetragenen Kurstermin, auf Wunsch mit 2. Kurstag
 * (VKU an zwei Abenden, Nothilfekurs Freitag und Samstag oder ein ganzer Tag).
 */
const OFFERS = [
  {
    slug: "nothilfekurs",
    name: "Nothilfekurs",
    shortDescription: "10 Stunden, ab 14 Jahren, inklusive Ausweis",
    durationMinutes: 300,
    bufferMinutes: 0,
    priceRappen: 12000,
    reducedPriceRappen: 10000,
    capacity: 16,
    leadTimeHours: 48,
    sortOrder: 1,
  },
  {
    slug: "vku",
    name: "Verkehrskundeunterricht",
    shortDescription: "8 Lektionen an 2 Abenden, inklusive Unterlagen",
    durationMinutes: 180,
    bufferMinutes: 0,
    priceRappen: 18000,
    reducedPriceRappen: null,
    capacity: 12,
    leadTimeHours: 48,
    sortOrder: 2,
  },
  {
    slug: "schnupperstunde",
    name: "Schnupperstunde",
    shortDescription: "Die erste Lektion, zum Kennenlernen",
    durationMinutes: 45,
    bufferMinutes: 15,
    priceRappen: 7000,
    reducedPriceRappen: null,
    capacity: 1,
    leadTimeHours: 24,
    sortOrder: 3,
  },
  {
    slug: "fahrstunde",
    name: "Fahrstunde",
    shortDescription: "Einzellektion im Schulfahrzeug, 45 Minuten",
    durationMinutes: 45,
    bufferMinutes: 15,
    priceRappen: 9000,
    reducedPriceRappen: null,
    capacity: 1,
    leadTimeHours: 24,
    sortOrder: 4,
  },
];

/** Pakete und Abos. Erscheinen in der Preisliste, sind aber kein Termin. */
const PACKAGES = [
  {
    forSlug: "schnupperstunde",
    label: "5er Schnupperpaket",
    priceRappen: 29500,
    lessons: 5,
    note: "Für Lehrlinge, Studierende und IV",
    sortOrder: 1,
  },
  {
    forSlug: "fahrstunde",
    label: "10er Abo",
    priceRappen: 85000,
    lessons: 10,
    note: null,
    sortOrder: 2,
  },
  {
    forSlug: "fahrstunde",
    label: "15er Abo",
    priceRappen: 127500,
    lessons: 15,
    note: null,
    sortOrder: 3,
  },
];

/**
 * Findet den Migrationsordner.
 *
 * Im Auslieferungsimage liegt er neben der Anwendung, beim Entwickeln je
 * nachdem, aus welchem Verzeichnis gestartet wurde. Ein fest verdrahteter
 * relativer Pfad ginge genau dann schief, wenn niemand hinschaut.
 */
function migrationsFolder(): string {
  const candidates = [
    process.env.MIGRATIONS_DIR,
    path.join(process.cwd(), "drizzle"),
    // Aus .next/standalone heraus gestartet.
    path.join(process.cwd(), "..", "..", "drizzle"),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "meta", "_journal.json"))) return candidate;
  }

  throw new Error(
    `Migrationsordner nicht gefunden. Gesucht in: ${candidates.join(", ")}. ` +
      "Mit MIGRATIONS_DIR lässt er sich vorgeben.",
  );
}

export async function bootstrapDatabase(): Promise<void> {
  // Starten mehrere Container gleichzeitig, darf nur einer migrieren.
  // Die Sperre wird beim Beenden der Verbindung automatisch freigegeben.
  const client = await pool.connect();

  try {
    await client.query("select pg_advisory_lock($1)", [LOCK_KEY]);

    await migrate(db, { migrationsFolder: migrationsFolder() });

    for (const offer of OFFERS) {
      const [existing] = await db
        .select({ id: lessonTypes.id })
        .from(lessonTypes)
        .where(eq(lessonTypes.slug, offer.slug))
        .limit(1);
      if (!existing) await db.insert(lessonTypes).values(offer);
    }

    for (const bundle of PACKAGES) {
      const [existing] = await db
        .select({ id: pricePackages.id })
        .from(pricePackages)
        .where(eq(pricePackages.label, bundle.label))
        .limit(1);
      if (existing) continue;

      const [owner] = await db
        .select({ id: lessonTypes.id })
        .from(lessonTypes)
        .where(eq(lessonTypes.slug, bundle.forSlug))
        .limit(1);

      const { forSlug: _forSlug, ...values } = bundle;
      await db.insert(pricePackages).values({ ...values, lessonTypeId: owner?.id ?? null });
    }

    await createFirstAdmin();
  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
    client.release();
  }
}

async function createFirstAdmin(): Promise<void> {
  const [anyStaff] = await db.select({ id: staff.id }).from(staff).limit(1);
  if (anyStaff) return;

  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.warn(
      "Es gibt noch kein Konto. SEED_ADMIN_EMAIL und SEED_ADMIN_PASSWORD setzen und neu starten.",
    );
    return;
  }

  if (password.length < 12) {
    console.error("SEED_ADMIN_PASSWORD braucht mindestens 12 Zeichen. Kein Konto angelegt.");
    return;
  }

  const [admin] = await db
    .insert(staff)
    .values({
      email,
      name: "Administration",
      passwordHash: await argonHash(password, {
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
      }),
      role: "admin",
      // Beim ersten Anmelden ist ein eigenes Passwort zu setzen — das aus der
      // .env-Datei steht sonst dauerhaft in der Serverkonfiguration.
      mustChangePassword: true,
      calendarToken: randomBytes(24).toString("base64url"),
    })
    .returning({ id: staff.id });

  const offers = await db.select({ id: lessonTypes.id }).from(lessonTypes);
  if (offers.length > 0) {
    await db
      .insert(staffLessonTypes)
      .values(offers.map((offer) => ({ staffId: admin.id, lessonTypeId: offer.id })));
  }

  console.log(`Administrationskonto für ${email} angelegt.`);
  console.log("SEED_ADMIN_EMAIL und SEED_ADMIN_PASSWORD jetzt aus der .env entfernen.");
}

/** Prüft, ob die Datenbank überhaupt erreichbar ist. */
export async function pingDatabase(): Promise<void> {
  await db.execute(sql`select 1`);
}
