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

    // Wer sich über Google anmeldet, wird über diese unveränderliche Kennung
    // wiedererkannt — nicht über die Mailadresse, die sich ändern kann.
    googleSub: text("google_sub"),
    googleLinkedAt: timestamp("google_linked_at", { withTimezone: true }),
    // Lässt sich abschalten, sobald Google eingerichtet ist. Dann ist das
    // vergebene Startpasswort endgültig wertlos.
    passwordLoginEnabled: boolean("password_login_enabled").notNull().default(true),
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
    // Ein Google-Konto darf nicht auf zwei Mitarbeitende zeigen.
    uniqueIndex("staff_google_sub_unique").on(t.googleSub),
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

/** Wiederkehrende Wochenverfügbarkeit, z. B. jeden Dienstag 08:00–12:00. */
export const availabilityRules = pgTable(
  "availability_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    // 0 = Sonntag … 6 = Samstag
    weekday: smallint("weekday").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    validFrom: date("valid_from"),
    validUntil: date("valid_until"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("availability_rules_staff_idx").on(t.staffId, t.weekday)],
);

/** Einzelne Ausnahmen: zusätzlicher Block oder Abwesenheit an einem Datum. */
export const availabilityExceptions = pgTable(
  "availability_exceptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
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
  ],
);

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
