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
    body: "Ich bin Sozialpädagogin HF und seit einigen Jahren auch Fahrlehrerin, dazu Nothelfer- und BLS-AED-Instruktorin. Aus der Sozialpädagogik habe ich gelernt, wie man etwas erklärt, ohne jemanden zu überfordern — das hilft auch auf der Autobahn.",
    tags: ["Fahrlehrerin", "Sozialpädagogin HF", "BLS-AED Instruktorin"],
    photo: "/images/team-christina.jpg",
  },
  {
    name: "Jolanda",
    role: "Nothelferinstruktorin & FaBe",
    owner: false,
    body: "Hauptberuflich bin ich Fachfrau Betreuung, daneben unterrichte ich den Nothilfekurs. Erste Hilfe ist mir wichtig, weil ich weiss, wie schnell man im Ernstfall überfordert ist — genau dann soll der Kurs greifen, ganz automatisch.",
    tags: ["Nothelferinstruktorin", "FaBe"],
    photo: "/images/team-jolanda.jpg",
  },
];

export const site = {
  name: "DriveOnPoint",
  // Einzelunternehmen, kein Handelsregistereintrag: der volle Name der
  // verantwortlichen Person gehört ins Impressum, nicht ein Firmenname.
  legalName: "Christina Mühle",
  claim: "Fahrschule",
  domain: "driveonpoint.ch",

  contact: {
    street: "Musterstrasse 12", // ###
    zip: "4051", // ###
    city: "Basel", // ###
    phone: "+41 77 536 63 59",
    phoneHref: "+41775366359",
    email: "inbox@driveonpoint.ch",
  },

  hours: [
    { days: "Montag bis Freitag", time: "07:00 – 21:00" },
    { days: "Samstag", time: "08:00 – 16:00" },
    { days: "Sonntag", time: "geschlossen" },
  ],

  region: ["Basel", "Allschwil", "Binningen", "Muttenz", "Pratteln", "Liestal"], // ###

  languages: ["Deutsch", "Englisch"], // ###

  hero: {
    headline: ["Fahren lernen,", "ohne Druck."],
    lead: "Zwei Fahrlehrerinnen, dein Tempo. Wir sagen dir ehrlich, wo du stehst — und melden dich erst zur Prüfung an, wenn du wirklich bereit bist.",
  },

  philosophy: {
    title: "Unsere Philosophie",
    body: "Wie schnell du vorankommst, bestimmst du. Die einen brauchen zehn Fahrstunden, die anderen vierzig — beides ist normal, und es gibt keinen Lehrplan, der dich in ein festes Tempo zwingt.",
    tags: ["Gleiche Fahrlehrerin", "Kein Standardtempo", "Ehrliche Rückmeldung"],
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
      note: "Pflicht vor der praktischen Prüfung, egal bei welcher Fahrschule du fährst",
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

  // Ergänzen die drei Chips oben mit echten Zusatzinfos statt sie zu
  // wiederholen — "eigenes Tempo" und "gleiche Person" stehen schon dort.
  reasons: [
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
   * Die Dateien liegen unter /public/images. Beim Ersetzen durch ein neues
   * Foto einen neuen Dateinamen vergeben und ihn hier eintragen — sonst
   * zeigt der dauerhafte Zwischenspeicher weiter das alte Bild.
   */
  images: {
    hero: {
      src: "/images/fahrzeug-tucson.jpg",
      alt: "Schulfahrzeug von DriveOnPoint",
      width: 738,
      height: 497,
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
