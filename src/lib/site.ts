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

// Ausserhalb von `site`, damit auch die Texte weiter unten (Gründe, Fragen)
// die Orte nennen können, ohne die Liste ein zweites Mal zu pflegen.
const region = ["Basel", "Allschwil", "Binningen", "Muttenz", "Pratteln", "Liestal"]; // ###
const regionText = `${region.join(", ")} und Umgebung`;

const team: TeamMember[] = [
  {
    name: "Christina",
    role: "Sozialpädagogin HF & Fahrlehrerin",
    owner: true,
    body: "Ich bin Sozialpädagogin HF und seit einigen Jahren auch Fahrlehrerin, dazu Nothelfer- und BLS-AED-Instruktorin. In der Sozialpädagogik habe ich gelernt, Dinge so zu erklären, dass niemand überfordert ist. Das hilft auch auf der Autobahn.",
    tags: ["Fahrlehrerin", "Sozialpädagogin HF", "BLS-AED Instruktorin"],
    photo: "/images/team-christina.jpg",
  },
  {
    name: "Jolanda",
    role: "Nothelferinstruktorin & FaBe",
    owner: false,
    body: "Hauptberuflich bin ich Fachfrau Betreuung, daneben gebe ich den Nothilfekurs. Erste Hilfe liegt mir am Herzen, weil ich weiss, wie schnell man im Ernstfall überfordert ist. Deshalb üben wir im Kurs so lange, bis die Handgriffe sitzen.",
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

  region,

  languages: ["Deutsch", "Englisch"], // ###

  hero: {
    headline: ["Fahren lernen,", "ohne Druck."],
    // Steht auch als Beschreibung in den Suchergebnissen, deshalb vorne
    // die Suchbegriffe und insgesamt unter 160 Zeichen.
    lead: "Fahrschule in Basel und Baselland. Du lernst bei einer Fahrlehrerin und in deinem Tempo, und zur Prüfung gehst du erst, wenn du bereit bist.",
  },

  philosophy: {
    title: "So arbeiten wir",
    body: "Wie schnell du vorankommst, bestimmst du. Manche brauchen zehn Fahrstunden, andere vierzig. Beides ist normal, und niemand drängt dich in ein festes Tempo.",
    tags: ["Immer dieselbe Fahrlehrerin", "Dein Tempo", "Offene Rückmeldung"],
  },

  /** Kurzbeschreibungen der drei Stufen, wie sie auf der Startseite stehen. */
  offers: {
    nothilfekurs: {
      step: "Voraussetzung",
      title: "Nothilfekurs",
      lead: "Im Nothilfekurs lernst du, was bei einem Unfall zu tun ist: die Unfallstelle sichern, Hilfe rufen, jemanden wiederbeleben. Und du übst, dabei ruhig zu bleiben.",
      duration: "10 Stunden",
      minAge: "14 Jahre",
      note: "Pflicht, bevor du zur Theorieprüfung darfst",
    },
    vku: {
      step: "VKU",
      title: "Verkehrskundeunterricht",
      lead: "Im VKU geht es um das, was beim Fahren im Kopf passiert: Gefahren früh sehen, Bremswege einschätzen, Reaktionszeit und sicheres Verhalten im Verkehr.",
      topics: ["Gefahrenwahrnehmung", "Physikalische Grundlagen", "Sicheres Verhalten"],
      note: "Pflicht vor der praktischen Prüfung, egal bei welcher Fahrschule du fährst",
    },
    fahrstunden: {
      step: "Praxis",
      title: "Fahrstunden",
      lead: "Für den Führerausweis Kategorie B. Wir holen dich in Basel und Baselland ab. Du kannst mit einer Schnupperstunde anfangen und danach einzeln oder mit einem Abo weiterfahren.",
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
      body: "So viele, wie du brauchst. Wir sagen dir, wann du so weit bist, und melden dich dann an.",
      meta: "45 Minuten pro Lektion",
    },
    {
      title: "Praktische Prüfung",
      body: "Rund 60 Minuten mit dem Experten. Wenn du bestehst, bekommst du den Führerausweis auf Probe für drei Jahre.",
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
      title: "Kurse und Fahrstunden bei uns",
      body: "Nothilfekurs, VKU und Fahrstunden machst du bei denselben Leuten. Du musst dich nicht an drei Orten anmelden.",
    },
    {
      title: "Abholung in Basel und Baselland",
      body: `Zuhause, an der Schule oder bei der Arbeit, in ${regionText}. Die Fahrt zu dir zählt nicht zur Lektion.`,
    },
    {
      title: "Absagen bis 24 Stunden vorher",
      body: "Kostenlos, und du musst keinen Grund angeben. Den Link findest du in der Bestätigungsmail.",
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
      alt: "Schulfahrzeug der Fahrschule DriveOnPoint in Basel",
      width: 738,
      height: 497,
    },
  },

  team,

  faq: [
    {
      q: "Wie viele Fahrstunden brauche ich?",
      a: "Das kann vorher niemand seriös sagen. Wer privat oft mitfährt, braucht meistens weniger. Nach jeder Lektion schauen wir zusammen, wo du stehst.",
    },
    {
      q: "Wo finden die Fahrstunden statt?",
      a: `Wir holen dich ab, wo es dir passt, in ${regionText}. Vor der ersten Lektion rufen wir dich an und machen den genauen Treffpunkt ab. Wohnst du etwas ausserhalb? Frag trotzdem, meistens geht es.`,
    },
    {
      q: "Ich wohne in Baselland. Wo mache ich die Prüfung?",
      a: "Die praktische Prüfung legst du beim Strassenverkehrsamt deines Wohnkantons ab, also in Basel-Stadt oder Basel-Landschaft. Bei uns fahren kannst du so oder so.",
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
