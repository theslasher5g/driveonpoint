/**
 * Sämtliche Texte und Stammdaten der öffentlichen Seite.
 *
 * Preise, Pakete, Rabatte, Termine und Mitarbeitende kommen aus der Datenbank
 * und werden im Team-Bereich gepflegt. Alles in dieser Datei ist fester Text
 * und wird hier geändert — danach neu bauen und den Container neu starten.
 *
 * Mit ### markierte Stellen sind Platzhalter und müssen vor dem Aufschalten
 * durch die echten Angaben ersetzt werden.
 */

export type TeamMember = {
  name: string;
  role: string;
  /** Kennzeichnet die Inhaberin. Erscheint als Marke auf der Karte. */
  owner: boolean;
  body: string;
  tags: string[];
  /** Pfad zum Porträt unter /public/images. Leer lassen, bis eines da ist. */
  photo: string;
};

const team: TeamMember[] = [
  {
    name: "Christina",
    role: "Sozialpädagogin HF & Fahrlehrerin",
    owner: true,
    body: "Ich bin Sozialpädagogin HF, Fahrlehrerin sowie Nothelferinstruktorin und BLS-AED Instruktorin. Durch meine pädagogische Erfahrung lege ich grossen Wert auf eine klare, ruhige und verständliche Kommunikation. Mir ist wichtig, dass du dich in jeder Fahrsituation wohl und sicher fühlst.",
    tags: ["Fahrlehrerin", "Sozialpädagogin HF", "BLS-AED Instruktorin"],
    photo: "",
  },
  {
    name: "Jolanda",
    role: "Nothelferinstruktorin & FaBe",
    owner: false,
    body: "Ich bin Fachfrau Betreuung mit Herz und Leidenschaft. Als sozialer, selbstbewusster und lebensfroher Mensch bringe ich viel Humor und positive Energie in meinen Alltag. Neben meiner Tätigkeit als FaBe bin ich auch Nothelferinstruktorin. Es bereitet mir grosse Freude, Menschen für das Thema Erste Hilfe zu begeistern – in Notfällen richtig zu handeln ist für mich eine Herzenssache.",
    tags: ["Nothelferinstruktorin", "FaBe"],
    photo: "",
  },
];

export const site = {
  name: "DriveOnPoint",
  legalName: "DriveOnPoint GmbH", // ###
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

  region: ["Zürich", "Oerlikon", "Wallisellen", "Dübendorf", "Kloten", "Opfikon"], // ###

  languages: ["Deutsch", "Englisch"], // ###

  hero: {
    headline: ["Fahren lernen,", "ohne Druck."],
    lead: "Herzlich willkommen bei DriveOnPoint — deiner Fahrschule mit Herz, Leidenschaft und Professionalität. Wir begleiten dich auf deinem Weg zum Führerausweis kompetent, empathisch und mit Freude am Fahren.",
  },

  philosophy: {
    title: "Unsere Philosophie",
    body: "Bei DriveOnPoint steht dein persönlicher Lernstand im Mittelpunkt. Wir arbeiten mit dir individuell und in deinem eigenen Lerntempo – ganz ohne Druck. Leidenschaft, Professionalität und Menschlichkeit bilden dabei die Grundlage unserer Arbeit.",
    tags: ["Individuell", "Professionell", "Mit Herz"],
  },

  /** Kurzbeschreibungen der drei Stufen, wie sie auf der Startseite stehen. */
  offers: {
    nothilfekurs: {
      step: "Voraussetzung",
      title: "Nothilfekurs",
      lead: "In unserem Nothilfekurs lernst du praxisnah, wie du in Notsituationen ruhig bleibst und richtig handelst – vom Absichern der Unfallstelle bis zur Wiederbelebung.",
      duration: "10 Stunden",
      minAge: "14 Jahre",
      note: "Pflicht vor der Theorieprüfung – damit du im Ernstfall Leben retten kannst",
    },
    vku: {
      step: "VKU",
      title: "Verkehrskundeunterricht",
      lead: "Der VKU bereitet dich auf die Verantwortung im Strassenverkehr vor – mit Themen wie Gefahrenwahrnehmung, physikalische Grundlagen, Reaktionszeit und sicheres Verhalten.",
      topics: ["Gefahrenwahrnehmung", "Physikalische Grundlagen", "Sicheres Verhalten"],
      note: "Investiere in deine Sicherheit und die der anderen Verkehrsteilnehmer",
    },
    fahrstunden: {
      step: "Praxis",
      title: "Fahrstunden",
      lead: "Flexible Pakete für deine praktische Ausbildung – vom Schnuppern bis zum kompletten Abo.",
      note: "Alle Preise inklusive Versicherung und Administration.",
    },
  },

  /** Der Schweizer Weg zum Führerausweis, in der Reihenfolge der Schritte. */
  path: [
    {
      title: "Nothilfekurs",
      body: "Zehn Stunden lebensrettende Sofortmassnahmen. Pflicht, bevor du zur Theorieprüfung antreten darfst.",
      meta: "10 Stunden, ab 14 Jahren",
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
      body: "So viele, wie du brauchst — in deinem eigenen Lerntempo. Wir sagen dir ehrlich, wann du bereit bist, und melden dich erst dann an.",
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

  reasons: [
    {
      title: "Dein Lerntempo bestimmt den Takt",
      body: "Wir arbeiten individuell mit dir, ganz ohne Druck. Niemand wird durch einen Lehrplan gehetzt, der nicht zu ihm passt.",
    },
    {
      title: "Du fährst immer bei derselben Person",
      body: "Kein Wechsel zwischen Fahrlehrern, kein Erklären von vorne. Wer dich anlernt, meldet dich auch zur Prüfung an.",
    },
    {
      title: "Kurse und Fahrstunden aus einer Hand",
      body: "Nothilfekurs, Verkehrskunde und Praxis bei denselben Leuten — du musst nichts zweimal organisieren.",
    },
    {
      title: "Absagen bis 24 Stunden vorher",
      body: "Kostenlos und ohne Rückfragen. Der Link dazu steht in deiner Bestätigungsmail.",
    },
  ],

  /**
   * Drei Bildplätze. Die Dateien liegen unter /public/images und sind aktuell
   * Platzhalter — einfach durch echte Fotos ersetzen. Weil die Dateien
   * dauerhaft zwischengespeichert werden, dabei einen neuen Dateinamen
   * vergeben und ihn hier eintragen.
   * Empfohlen: 1600×1200 px, WebP oder JPEG, unter 300 KB.
   */
  images: {
    hero: {
      src: "/images/platzhalter-fahrzeug.svg",
      alt: "Schulfahrzeug von DriveOnPoint",
      width: 1600,
      height: 1200,
    },
    team: {
      src: "/images/platzhalter-team.svg",
      alt: "Christina und Jolanda von DriveOnPoint",
      width: 1600,
      height: 1200,
    },
    course: {
      src: "/images/platzhalter-kursraum.svg",
      alt: "Kursraum für Verkehrskundeunterricht und Nothilfekurs",
      width: 1600,
      height: 1200,
    },
  },

  team,

  faq: [
    {
      q: "Wie viele Fahrstunden brauche ich?",
      a: "Das lässt sich vorher nicht sagen — und wir raten dir von jeder Fahrschule ab, die dir eine Zahl nennt. Wer regelmässig privat mitfährt, braucht erfahrungsgemäss weniger. Wir schauen nach jeder Lektion gemeinsam, wo du stehst.",
    },
    {
      q: "Kann ich eine Lektion absagen?",
      a: "Ja, kostenlos bis 24 Stunden vor Beginn. Den Link findest du in der Bestätigungsmail. Später abgesagte Lektionen werden verrechnet.",
    },
    {
      q: "Muss ich den Nothilfekurs bei euch machen?",
      a: "Nein. Jeder anerkannte Nothilfeausweis wird akzeptiert, solange er nicht älter als sechs Jahre ist.",
    },
    {
      q: "Gibt es eine Ermässigung?",
      a: "Ja. Lehrlinge, Studierende und IV-Bezügerinnen und -Bezüger zahlen bei mehreren Angeboten weniger. Bring einfach den Ausweis mit.",
    },
    {
      q: "Wie bezahle ich?",
      a: "Nach der Lektion per TWINT oder Karte, oder gesammelt auf Rechnung. Kurse und Abos werden vor Beginn bezahlt.",
    },
    {
      q: "Bekomme ich das Auto für die Prüfung?",
      a: "Ja. Du trittst mit demselben Fahrzeug an, in dem du geübt hast. Anmeldung und Abholung übernehmen wir.",
    },
  ],
} as const;

export type SiteContent = typeof site;
