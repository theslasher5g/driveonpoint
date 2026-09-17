/**
 * Sämtliche Texte und Stammdaten der öffentlichen Seite.
 *
 * Preise, Rabatte, Termine und Mitarbeitende kommen aus der Datenbank und
 * werden im Team-Bereich gepflegt. Alles in dieser Datei ist fester Text und
 * wird hier geändert — danach neu bauen und den Container neu starten.
 *
 * Mit ### markierte Stellen sind Platzhalter und müssen vor dem Aufschalten
 * durch die echten Angaben ersetzt werden.
 */

export const site = {
  name: "Drive on Point",
  legalName: "Drive on Point GmbH", // ###
  claim: "Fahrschule",
  domain: "driveonpoint.ch",

  contact: {
    street: "Musterstrasse 12", // ###
    zip: "8050", // ###
    city: "Zürich", // ###
    phone: "+41 44 000 00 00", // ###
    phoneHref: "+41440000000", // ###
    email: "info@driveonpoint.ch", // ###
    uid: "CHE-000.000.000", // ### Handelsregister-Nummer
  },

  hours: [
    { days: "Montag bis Freitag", time: "07:00 – 21:00" },
    { days: "Samstag", time: "08:00 – 16:00" },
    { days: "Sonntag", time: "geschlossen" },
  ],

  /** Einzugsgebiet — erscheint im Fussbereich und in den Metadaten. */
  region: ["Zürich", "Oerlikon", "Wallisellen", "Dübendorf", "Kloten", "Opfikon"],

  languages: ["Deutsch", "Englisch", "Italienisch"], // ###

  hero: {
    headline: ["Fahren lernen,", "ohne Umwege."],
    lead:
      "Fahrstunden, Verkehrskundeunterricht und Nothelferkurs für den Führerausweis Kategorie B — in Zürich Nord, bei Fahrlehrerinnen und Fahrlehrern, die dich bis zur Prüfung begleiten.",
  },

  /**
   * Der Schweizer Weg zum Führerausweis. Diese Reihenfolge ist tatsächlich
   * eine Abfolge — deshalb ist sie nummeriert, anders als die Angebote.
   */
  path: [
    {
      title: "Nothelferkurs",
      body: "Zehn Stunden lebensrettende Sofortmassnahmen. Der Ausweis gilt sechs Jahre und wird für den Lernfahrausweis verlangt.",
      meta: "10 Stunden, ab 16 Jahren",
    },
    {
      title: "Sehtest und Gesuch",
      body: "Sehtest bei Optiker oder Augenarzt, danach das Gesuch beim Strassenverkehrsamt deines Wohnkantons einreichen.",
      meta: "Beim Strassenverkehrsamt",
    },
    {
      title: "Theorieprüfung",
      body: "Die Basistheorie am Computer. Wer sie besteht, erhält den Lernfahrausweis und darf mit Begleitung fahren.",
      meta: "50 Fragen, 45 Minuten",
    },
    {
      title: "Verkehrskundeunterricht",
      body: "Vier Abende zu je zwei Lektionen. Obligatorisch, bevor du zur praktischen Prüfung antreten darfst.",
      meta: "8 Lektionen an 4 Abenden",
    },
    {
      title: "Fahrstunden",
      body: "So viele, wie du brauchst. Wir sagen dir ehrlich, wann du bereit bist — und melden dich erst dann an.",
      meta: "45 Minuten pro Lektion",
    },
    {
      title: "Praktische Prüfung",
      body: "Rund 60 Minuten mit dem Experten. Bestanden heisst: Führerausweis auf Probe, drei Jahre lang.",
      meta: "Mit unserem Schulfahrzeug",
    },
    {
      title: "Weiterausbildung WAB",
      body: "Ein Kurstag innerhalb der Probezeit. Danach wird der Ausweis unbefristet ausgestellt.",
      meta: "1 Tag, innert 3 Jahren",
    },
  ],

  /** Gründe, hier zu buchen. Bewusst konkret statt werbend. */
  reasons: [
    {
      title: "Du fährst immer bei derselben Person",
      body: "Kein Wechsel zwischen Fahrlehrern, kein Erklären von vorne. Wer dich anlernt, meldet dich auch zur Prüfung an.",
    },
    {
      title: "Abholung, wo du gerade bist",
      body: "Zuhause, Schule oder Arbeitsplatz im Einzugsgebiet — die Lektion beginnt dort, wo sie dir passt.",
    },
    {
      title: "Absagen bis 24 Stunden vorher",
      body: "Kostenlos und ohne Rückfragen. Der Link dazu steht in deiner Bestätigungsmail.",
    },
    {
      title: "Prüfungsfahrzeug ist dein Übungsfahrzeug",
      body: "Du trittst mit dem Auto an, das du kennst. Keine Überraschung am Prüfungstag.",
    },
  ],

  /**
   * Drei Bildplätze. Die Dateien liegen unter /public/images und sind aktuell
   * Platzhalter — einfach durch echte Fotos gleichen Namens ersetzen.
   * Empfohlen: 1600×1200 px, WebP oder JPEG, unter 300 KB.
   */
  images: {
    hero: {
      src: "/images/platzhalter-fahrzeug.svg",
      alt: "Schulfahrzeug von Drive on Point vor der Fahrschule",
      width: 1600,
      height: 1200,
    },
    team: {
      src: "/images/platzhalter-team.svg",
      alt: "Fahrlehrerinnen und Fahrlehrer von Drive on Point",
      width: 1600,
      height: 1200,
    },
    course: {
      src: "/images/platzhalter-kursraum.svg",
      alt: "Kursraum für Verkehrskundeunterricht und Nothelferkurs",
      width: 1600,
      height: 1200,
    },
  },

  /** Wird im Team-Bereich nicht gepflegt — hier ändern. */
  team: [
    {
      name: "Vorname Nachname", // ###
      role: "Inhaberin und Fahrlehrerin",
      body: "Seit 2012 Fahrlehrerin, Ausbildung Kategorie B und Verkehrskundeunterricht.", // ###
    },
    {
      name: "Vorname Nachname", // ###
      role: "Fahrlehrer",
      body: "Unterrichtet auf Deutsch und Italienisch, Schwerpunkt Autobahn und Nachtfahrten.", // ###
    },
  ],

  faq: [
    {
      q: "Wie viele Fahrstunden brauche ich?",
      a: "Das lässt sich vorher nicht sagen. Wer regelmässig privat mitfährt, braucht erfahrungsgemäss weniger. Wir schauen nach jeder Lektion gemeinsam, wo du stehst, und melden dich erst zur Prüfung an, wenn du sie bestehst.",
    },
    {
      q: "Kann ich eine Lektion absagen?",
      a: "Ja, kostenlos bis 24 Stunden vor Beginn. Den Link findest du in der Bestätigungsmail. Später abgesagte Lektionen werden verrechnet.",
    },
    {
      q: "Muss ich den Nothelferkurs bei euch machen?",
      a: "Nein. Jeder anerkannte Nothelferausweis wird akzeptiert, solange er nicht älter als sechs Jahre ist.",
    },
    {
      q: "Wie bezahle ich?",
      a: "Nach der Lektion per TWINT oder Karte, oder gesammelt auf Rechnung. Kurse werden vor Kursbeginn bezahlt.",
    },
    {
      q: "Bekomme ich das Auto für die Prüfung?",
      a: "Ja. Du trittst mit demselben Fahrzeug an, in dem du geübt hast. Anmeldung und Abholung übernehmen wir.",
    },
  ],
} as const;

export type SiteContent = typeof site;
