import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * admin     — alles, inklusive Mitarbeiterverwaltung
 * manager   — Kalender, Preise, Rabattaktionen
 * bearbeiter— nur Kalender ansehen und eigene Verfügbarkeit pflegen
 */
export const staffRole = pgEnum("staff_role", ["admin", "manager", "bearbeiter"]);

export const bookingStatus = pgEnum("booking_status", [
  "angefragt",
  "bestaetigt",
  "abgesagt",
  "erledigt",
]);

export const staff = pgTable(
  "staff",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    role: staffRole("role").notNull().default("bearbeiter"),
    active: boolean("active").notNull().default(true),
    mustChangePassword: boolean("must_change_password").notNull().default(true),

    // Zwei-Faktor-Authentifizierung per TOTP (RFC 6238), kompatibel mit
    // Google Authenticator, Authy, 1Password und jeder anderen solchen App.
    // Der Secret-Wert ist verschlüsselt abgelegt (siehe src/lib/auth/totp.ts)
    // — ein Datenbankleck allein reicht damit nicht, um Codes zu erzeugen.
    totpSecret: text("totp_secret"),
    totpEnabled: boolean("totp_enabled").notNull().default(false),
    totpConfirmedAt: timestamp("totp_confirmed_at", { withTimezone: true }),
    // Einmal-Wiederherstellungscodes für den Fall eines verlorenen Geräts.
    // Gespeichert werden nur Hashes, die Klartext-Codes stehen einmalig in
    // der Antwort der Einrichtung.
    mfaRecoveryCodes: jsonb("mfa_recovery_codes").$type<
      { hash: string; usedAt: string | null }[]
    >(),

    // Erlaubt das Abonnieren des eigenen Kalenders in Google/Apple Kalender.
    calendarToken: text("calendar_token").notNull(),
    // Welche Lektionsarten diese Person überhaupt geben kann.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("staff_email_unique").on(t.email),
    uniqueIndex("staff_calendar_token_unique").on(t.calendarToken),
  ],
);

export const staffSessions = pgTable(
  "staff_sessions",
  {
    // SHA-256 des Cookie-Werts. Ein Datenbankleck gibt keine gültigen Sitzungen her.
    tokenHash: text("token_hash").primaryKey(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    ipHash: text("ip_hash"),
  },
  (t) => [index("staff_sessions_staff_idx").on(t.staffId)],
);

export const lessonTypes = pgTable(
  "lesson_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    shortDescription: text("short_description").notNull().default(""),
    // Dauer eines Termins in Minuten.
    durationMinutes: integer("duration_minutes").notNull().default(45),
    // Pause danach, damit Fahrlehrer zum nächsten Treffpunkt kommen.
    bufferMinutes: integer("buffer_minutes").notNull().default(15),
    // Preise in Rappen — Ganzzahl, damit nichts gerundet wird.
    priceRappen: integer("price_rappen").notNull().default(0),
    // Ermässigter Betrag für Lehrlinge, Studierende und IV. Leer bedeutet:
    // für dieses Angebot gibt es keine Ermässigung.
    reducedPriceRappen: integer("reduced_price_rappen"),
    reducedLabel: text("reduced_label").notNull().default("Lehrlinge, Studierende und IV"),
    // Gruppenkurse (VKU, Nothelfer) haben mehrere Plätze pro Termin.
    capacity: integer("capacity").notNull().default(1),
    // Wie viele Stunden im Voraus mindestens gebucht werden muss.
    leadTimeHours: integer("lead_time_hours").notNull().default(24),
    active: boolean("active").notNull().default(true),
    sortOrder: smallint("sort_order").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("lesson_types_slug_unique").on(t.slug)],
);

/**
 * Pakete und Abos.
 *
 * Bewusst getrennt von den Lektionsarten: ein 10er-Abo ist ein Kauf, kein
 * Kalendertermin. Es erscheint in der Preisliste, und die einzelnen Lektionen
 * daraus werden danach ganz normal als Fahrstunde gebucht.
 */
export const pricePackages = pgTable(
  "price_packages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Leer bedeutet: gehört zu keinem bestimmten Angebot.
    lessonTypeId: uuid("lesson_type_id").references(() => lessonTypes.id, {
      onDelete: "cascade",
    }),
    label: text("label").notNull(),
    priceRappen: integer("price_rappen").notNull(),
    // Wie viele Lektionen enthalten sind. Nur zur Anzeige.
    lessons: smallint("lessons"),
    note: text("note"),
    active: boolean("active").notNull().default(true),
    sortOrder: smallint("sort_order").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("price_packages_sort_idx").on(t.sortOrder)],
);

/** Welche Lektionsart welche Person anbieten darf. */
export const staffLessonTypes = pgTable(
  "staff_lesson_types",
  {
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    lessonTypeId: uuid("lesson_type_id")
      .notNull()
      .references(() => lessonTypes.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.staffId, t.lessonTypeId] })],
);

export const promotions = pgTable(
  "promotions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    label: text("label").notNull(),
    // Genau eines von beiden wird gesetzt.
    percentOff: smallint("percent_off"),
    amountOffRappen: integer("amount_off_rappen"),
    // Leer bedeutet: gilt für alle Angebote.
    lessonTypeId: uuid("lesson_type_id").references(() => lessonTypes.id, {
      onDelete: "cascade",
    }),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by").references(() => staff.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("promotions_window_idx").on(t.startsOn, t.endsOn)],
);

/**
 * Wiederkehrende Wochenverfügbarkeit, z. B. jeden Dienstag 08:00–12:00.
 *
 * Jedes Angebot hat einen eigenen Planer: der Verkehrskundeunterricht läuft
 * praktisch immer abends, Fahrstunden eher tagsüber. Ohne diese Zuordnung
 * liesse sich das nicht getrennt abbilden — eine allgemeine Zeit würde für
 * jedes Angebot gleichermassen gelten, obwohl ein Kurs faktisch nur zu
 * bestimmten Zeiten überhaupt stattfindet.
 */
export const availabilityRules = pgTable(
  "availability_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    lessonTypeId: uuid("lesson_type_id")
      .notNull()
      .references(() => lessonTypes.id, { onDelete: "cascade" }),
    // 0 = Sonntag … 6 = Samstag
    weekday: smallint("weekday").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    validFrom: date("valid_from"),
    validUntil: date("valid_until"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("availability_rules_staff_lesson_idx").on(t.staffId, t.lessonTypeId, t.weekday),
  ],
);

/**
 * Einzelne Ausnahmen: zusätzlicher Block oder Abwesenheit an einem Datum.
 *
 * Anders als die wöchentliche Regel bewusst ohne Zwang zu einem Angebot:
 * Ferien oder ein Arzttermin betreffen die ganze Person, nicht nur eine
 * Kursart — das müsste sonst für jedes Angebot einzeln eingetragen werden,
 * und ein vergessener Eintrag liesse einen Termin durchrutschen. Leer
 * bedeutet "gilt für alle Angebote"; wird eines angegeben, betrifft die
 * Ausnahme nur dieses.
 */
export const availabilityExceptions = pgTable(
  "availability_exceptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    lessonTypeId: uuid("lesson_type_id").references(() => lessonTypes.id, {
      onDelete: "cascade",
    }),
    day: date("day").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    // true = zusätzlich verfügbar, false = an diesem Tag blockiert
    available: boolean("available").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("availability_exceptions_staff_day_idx").on(t.staffId, t.day)],
);

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Kurzes Kürzel für die Bestätigungsmail, z. B. "DOP-7K2M".
    reference: text("reference").notNull(),
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
    lessonTypeId: uuid("lesson_type_id").references(() => lessonTypes.id, {
      onDelete: "set null",
    }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: bookingStatus("status").notNull().default("angefragt"),

    // Personendaten. Werden durch den Aufräumlauf geleert, sobald
    // purgeAfter erreicht ist — der Termin selbst bleibt als Statistik.
    customerName: text("customer_name"),
    customerEmail: text("customer_email"),
    customerPhone: text("customer_phone"),
    customerNote: text("customer_note"),
    anonymisedAt: timestamp("anonymised_at", { withTimezone: true }),
    purgeAfter: timestamp("purge_after", { withTimezone: true }).notNull(),

    // Erlaubt der Kundschaft das Absagen per Link, ohne Konto.
    cancelToken: text("cancel_token").notNull(),
    /**
     * Wann abgesagt wurde. Eigene Spalte statt `updatedAt`, weil der
     * Aufräumlauf nach 30 Tagen ebenfalls `updatedAt` anfasst — für die
     * Buchhaltung muss aber auch danach noch erkennbar sein, ob eine Absage
     * kurzfristig war und laut AGB verrechnet werden durfte.
     */
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    /**
     * Wer abgesagt hat. Nur eine kurzfristige Absage der Kundschaft ist laut
     * AGB verrechenbar; sagt die Fahrschule ab (Krankheit, Wetter), zählt
     * sie in der Buchhaltung nicht als Ausfall. Leer bei Absagen aus der
     * Zeit, bevor das erfasst wurde und die sich nicht zuordnen liessen.
     */
    cancelledBy: text("cancelled_by").$type<"kundschaft" | "fahrschule">(),
    // Wer den Termin zuletzt verschoben hat. Hat die Fahrschule verschoben,
    // darf die Kundschaft danach jederzeit kostenlos absagen — sie hat der
    // neuen Zeit ja nie zugestimmt.
    movedBy: text("moved_by").$type<"kundschaft" | "fahrschule">(),

    /**
     * Bestätigung per Mail (Double-Opt-In) bei Online-Buchungen. Bis zum
     * Klick auf den Link steht der Termin als "angefragt" und hält den
     * Platz nur bis confirmExpiresAt frei; danach zählt er nicht mehr und
     * wird beim nächsten stündlichen Lauf gelöscht. Mehrere gleichzeitig
     * gebuchte Fahrstunden teilen sich denselben Token — ein Klick
     * bestätigt alle. Im Team erfasste Termine sind sofort bestätigt.
     */
    confirmToken: text("confirm_token"),
    confirmExpiresAt: timestamp("confirm_expires_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    /** Wann die Erinnerung vor dem Termin verschickt wurde — nie doppelt. */
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    /**
     * Im Team als "nicht erschienen" markiert. Laut AGB wie eine
     * kurzfristige Absage verrechenbar, deshalb in der Buchhaltung getrennt
     * vom Umsatz aufgeführt.
     */
    noShowAt: timestamp("no_show_at", { withTimezone: true }),
    priceRappen: integer("price_rappen").notNull().default(0),
    appliedPromotionLabel: text("applied_promotion_label"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("bookings_reference_unique").on(t.reference),
    uniqueIndex("bookings_cancel_token_unique").on(t.cancelToken),
    index("bookings_staff_start_idx").on(t.staffId, t.startsAt),
    index("bookings_purge_idx").on(t.purgeAfter),
    index("bookings_confirm_token_idx").on(t.confirmToken),
  ],
);

/**
 * Warteliste für ausgebuchte Kurstermine (VKU, Nothilfekurs).
 *
 * Wird ein Platz frei, bekommen alle Eingetragenen eine Mail; wer zuerst
 * bucht, hat den Platz. Die Einträge verschwinden nach dem Kurstermin
 * (Aufräumlauf) oder sobald die Person den Kurs bucht.
 */
export const waitlistEntries = pgTable(
  "waitlist_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lessonTypeId: uuid("lesson_type_id")
      .notNull()
      .references(() => lessonTypes.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    // Für den Link "von der Warteliste streichen" in jeder Mail.
    token: text("token").notNull(),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("waitlist_token_unique").on(t.token),
    index("waitlist_session_idx").on(t.lessonTypeId, t.startsAt),
  ],
);

/**
 * Letzter Erfolg und letzter Fehler je Betriebsteil (Mailversand, Cron-Läufe)
 * — damit auffällt, wenn etwas stillsteht. Siehe lib/monitoring.ts.
 */
export const systemChecks = pgTable("system_checks", {
  key: text("key").primaryKey(),
  lastOkAt: timestamp("last_ok_at", { withTimezone: true }),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
  lastError: text("last_error"),
  alertedAt: timestamp("alerted_at", { withTimezone: true }),
});

/** Gleitendes Zeitfenster für die Anfragebegrenzung. */
export const rateLimitHits = pgTable(
  "rate_limit_hits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // z. B. "login:192.0.2.5" oder "booking:198.51.100.7"
    bucket: text("bucket").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rate_limit_hits_bucket_idx").on(t.bucket, t.occurredAt)],
);

/** Gesperrte Adressen. Nur IP — eine MAC-Adresse erreicht den Server nie. */
export const ipBlocks = pgTable(
  "ip_blocks",
  {
    ip: text("ip").primaryKey(),
    reason: text("reason").notNull(),
    blockedUntil: timestamp("blocked_until", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ip_blocks_until_idx").on(t.blockedUntil)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id").references(() => staff.id, { onDelete: "set null" }),
    actorLabel: text("actor_label"),
    action: text("action").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_time_idx").on(t.occurredAt)],
);

export type Staff = typeof staff.$inferSelect;
export type StaffRole = (typeof staffRole.enumValues)[number];
export type LessonType = typeof lessonTypes.$inferSelect;
export type PricePackage = typeof pricePackages.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Promotion = typeof promotions.$inferSelect;
