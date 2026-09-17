# Drive on Point

Website und Terminverwaltung einer Schweizer Fahrschule. Öffentliche Seiten,
Online-Buchung für Fahrstunden, VKU und Nothelferkurs, sowie ein interner
Bereich, in dem Mitarbeitende Kalender, Verfügbarkeit, Preise und Aktionen
pflegen.

Läuft vollständig in Docker auf einem eigenen Server. Keine fremden Dienste,
keine Tracker, keine Daten im Ausland.

---

## Was drin ist

**Öffentlich** — Startseite mit dem nächsten tatsächlich freien Termin,
Fahrstunden, Verkehrskundeunterricht, Nothelferkurs, Preise, Ausbildungsweg,
Über uns, Kontakt, Buchung, Impressum, Datenschutz, AGB.

**Buchung** — Angebot wählen, freien Termin aus dem Kalender der Mitarbeitenden
wählen, Name, Mailadresse und Telefonnummer angeben. Danach geht eine
Bestätigung mit Absagelink raus. Absagen funktioniert ohne Konto.

**Team-Bereich** unter `/team`, verlinkt unauffällig im Fussbereich:

| Rolle | Darf |
|---|---|
| Administration | alles, inklusive Konten und Rollen |
| Leitung | Kalender aller Mitarbeitenden, Preise, Rabattaktionen |
| Fahrlehrer | Kalender ansehen, eigene Verfügbarkeit pflegen |

---

## Erste Inbetriebnahme

Vorausgesetzt: ein Server mit Docker und Docker Compose, eine Domain, die
darauf zeigt, und ein Reverse Proxy mit TLS davor.

```bash
git clone <dieses Repository> driveonpoint
cd driveonpoint

cp .env.example .env
# Drei Geheimnisse erzeugen und in die .env eintragen:
openssl rand -base64 48   # SESSION_SECRET
openssl rand -base64 48   # CAPTCHA_SECRET
openssl rand -base64 48   # CRON_SECRET
# Dazu POSTGRES_PASSWORD, APP_URL, MAIL_DOMAIN und die SEED_ADMIN_* Zeilen.

docker compose up -d --build
docker compose logs -f app     # bis „Administrationskonto für … angelegt“ erscheint
```

Mehr ist nicht nötig. Beim Start spielt die Anwendung die Migrationen ein,
legt die drei Angebote an und erzeugt beim allerersten Mal das
Administrationskonto aus `SEED_ADMIN_EMAIL` und `SEED_ADMIN_PASSWORD`.

Danach beide `SEED_ADMIN_*`-Zeilen in der `.env` **leeren** und
`docker compose up -d` erneut ausführen. Beim ersten Anmelden verlangt die
Anwendung ohnehin ein eigenes Passwort.

> Die Migration liegt vorgeneriert unter `drizzle/`. Bei Schemaänderungen
> `npm run db:generate` ausführen und die neue Datei mit einchecken — der
> Start spielt sie dann von selbst ein.

### Reverse Proxy

Die Anwendung hört nur auf `127.0.0.1:3000`. Davor gehört ein Proxy, der TLS
beendet. Mit Caddy genügt:

```
driveonpoint.ch {
    reverse_proxy 127.0.0.1:3000
}
```

Wichtig: `TRUST_PROXY_HOPS` muss der Anzahl Proxys entsprechen. Bei einem
einzelnen Caddy oder nginx ist das `1`. Ein zu hoher Wert lässt sich mit einem
gefälschten `X-Forwarded-For` ausnutzen, um Sperren zu umgehen.

Das Sitzungs-Cookie wird mit `Secure` gesetzt. Über reines HTTP kommt daher
keine Anmeldung zustande — das ist Absicht, kein Fehler.

### Täglicher Aufräumlauf

Löscht Kundendaten nach Ablauf der Frist, entfernt abgelaufene Sitzungen und
alte Zähler. Als Cron-Eintrag auf dem Server:

```cron
17 3 * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://driveonpoint.ch/api/cron/aufraeumen
```

---

## Mailversand

Mitgeliefert ist ein Postfix-Container, der ausschliesslich sendet und nur im
internen Docker-Netz erreichbar ist. Damit die Mails nicht im Spam landen,
braucht die Domain drei DNS-Einträge:

```bash
# DKIM-Schlüssel auslesen, nachdem der Container einmal gelaufen ist:
docker compose exec mail cat /etc/opendkim/keys/driveonpoint.ch/mail.txt
```

| Typ | Name | Wert |
|---|---|---|
| TXT | `@` | `v=spf1 ip4:<Server-IP> -all` |
| TXT | `mail._domainkey` | aus dem Befehl oben |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:postmaster@driveonpoint.ch` |
| PTR | Server-IP | `mail.driveonpoint.ch` (beim Hoster setzen) |

Ohne PTR-Eintrag lehnen viele Anbieter die Mails ab. Wer sich das nicht antun
will, trägt in der `.env` stattdessen einen externen SMTP-Zugang ein
(`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`) — der Postfix-Container
wird dann nicht benutzt.

Zum Entwickeln fängt Mailpit alles ab, Weboberfläche auf
`http://localhost:8025`:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

---

## Anmeldung über Google

Freiwillig. Bleiben `GOOGLE_CLIENT_ID` und `GOOGLE_CLIENT_SECRET` leer,
erscheint der Knopf gar nicht erst und alles läuft über Passwort.

Einrichten in der Google Cloud Console:

1. Projekt anlegen, OAuth-Zustimmungsbildschirm ausfüllen.
2. Zugangsdaten → OAuth-Client-ID → Webanwendung.
3. Als autorisierten Weiterleitungs-URI **exakt** eintragen:
   `https://driveonpoint.ch/api/auth/google/callback`
4. Client-ID und Geheimnis in die `.env`, dann `docker compose up -d`.

**Die wichtigste Eigenschaft:** Über Google kommt nur herein, wer in dieser
Anwendung bereits ein aktives Konto hat — mit genau derselben Mailadresse.
Es wird nie automatisch eines angelegt. Ohne diese Regel hätte jeder mit
einem Google-Konto Zugang zum Team-Bereich.

Beim ersten Anmelden wird das Google-Konto mit dem bestehenden verknüpft.
Danach zählt die unveränderliche Google-Kennung, nicht mehr die Adresse — wer
seine Google-Adresse ändert, behält den Zugang. Unter *Mein Konto* lässt sich
die Verknüpfung wieder lösen und, sobald Google eingerichtet ist, die
Passwortanmeldung ganz abschalten. Beides ist gegen Aussperren abgesichert:
Der letzte verbleibende Weg ins eigene Konto lässt sich nicht entfernen.

Technisch: Authorization Code mit PKCE, `state` gegen untergeschobene
Anmeldungen, `nonce` gegen wiederverwendete Token, und unbestätigte
Google-Adressen werden abgewiesen. Der Zwischenstand reist in einem
signierten, kurzlebigen Cookie mit und wird nach einem Versuch entwertet.

> Datenschutz: Damit fliessen Anmeldezeitpunkt und Domain an Google. Das
> betrifft ausschliesslich Mitarbeitende, die diesen Weg freiwillig wählen —
> die Kundschaft bucht weiterhin ohne Google. Der Abschnitt dazu steht in der
> Datenschutzerklärung; bei Änderungen am Verfahren muss er mitwachsen.

---

## Kalender in Google oder Apple einbinden

Jede Person findet unter **Mein Konto** einen persönlichen Link. In Google
Kalender unter „Andere Kalender → Per URL“ einfügen, in Apple Kalender über
„Ablage → Neues Kalenderabonnement“.

Das ist bewusst eine Einbahnstrasse: Termine der Fahrschule erscheinen im
privaten Kalender, aber private Einträge fliessen nicht zurück. Verfügbarkeit
wird weiterhin im Team-Bereich gepflegt.

Zwei Dinge sind dabei zu wissen. Erstens fragt Google abonnierte Kalender nur
alle paar Stunden ab — eine neue Buchung erscheint dort verzögert, im
Team-Kalender dieser Seite sofort. Zweitens enthält der Kalendereintrag
absichtlich nur Lektionsart und Kürzel, keine Kundendaten: sonst lägen Name und
Telefonnummer der Kundschaft bei Google.

Wer echte Zweiwegsynchronisation will — also auch private Google-Termine als
Abwesenheit berücksichtigt —, braucht die Google Calendar API mit OAuth. Das
ist möglich, bedeutet aber eine Google-Cloud-Registrierung, einen
Zustimmungsbildschirm pro Mitarbeitendem und eine Einwilligung nach DSGVO,
weil dann Termindaten zu Google fliessen. Dafür ist hier bewusst nichts
eingebaut.

---

## Wer was ändert

**Ohne Programmierkenntnisse, im Team-Bereich:**
Preise, Dauer, Plätze und Vorlaufzeit je Angebot; Rabattaktionen starten,
pausieren und löschen; Verfügbarkeit und Abwesenheiten; Konten, Rollen und
Passwörter; Termine absagen.

### Wie Angebote, Ermässigungen und Abos zusammenhängen

Buchbar sind vier Dinge: Nothilfekurs, Verkehrskundeunterricht,
Schnupperstunde und Fahrstunde. Jedes hat einen regulären Preis und
wahlweise einen ermässigten für Lehrlinge, Studierende und IV.

**Pakete und Abos** sind bewusst davon getrennt. Ein 10er-Abo ist ein Kauf,
kein Kalendertermin — es erscheint in der Preisliste, und die einzelnen
Lektionen daraus werden danach ganz normal als Fahrstunde gebucht. Bezahlt
wird ausserhalb der Website.

**Bei Kursen** ist die hinterlegte Dauer die Länge des ersten Termins, der im
Kalender erscheint, nicht die Gesamtdauer. Der VKU läuft über vier Abende,
der Nothilfekurs über ein Wochenende: Eingetragen wird die Verfügbarkeit für
den Kursbeginn, gebucht wird der Platz, und die Folgetermine stehen im
Kurstext auf der jeweiligen Seite.

**In Dateien, danach neu bauen:**

| Was | Wo |
|---|---|
| Adresse, Telefon, Öffnungszeiten, Texte, Team, FAQ | `src/lib/site.ts` |
| Bilder | `public/images/` |
| Farben, Schrift, Abstände | `src/app/globals.css` |
| Rechtstexte | `src/app/impressum`, `datenschutz`, `agb` |

```bash
docker compose up -d --build
```

### Bilder ersetzen

Drei Platzhalter liegen unter `public/images/`. Ersetzen durch echte Fotos,
empfohlen 1600 × 1200 px, WebP oder JPEG, unter 300 KB. Weil diese Dateien
dauerhaft zwischengespeichert werden, beim Austausch einen **neuen Dateinamen**
vergeben und ihn in `src/lib/site.ts` eintragen — sonst sehen wiederkehrende
Besucher noch das alte Bild.

---

## Rechtliches

Impressum, Datenschutzerklärung und AGB sind **Vorlagen**. Sie beschreiben
zutreffend, was die Anwendung technisch tut, ersetzen aber keine
Rechtsberatung. Vor dem Aufschalten:

- Alle mit `###` markierten Angaben in `src/lib/site.ts` ersetzen.
- Absage- und Zahlungsfristen in den AGB mit der tatsächlichen Praxis abgleichen.
- Die Texte von einer rechtskundigen Person prüfen lassen.

Wird später etwas dazugebaut, das Daten an Dritte gibt — Zahlungsdienst,
Kartendienst, Statistik, Google-Kalender-Anbindung —, muss die
Datenschutzerklärung mitwachsen.

**Aufbewahrung.** Name, Mailadresse, Telefonnummer und Bemerkung werden
`RETENTION_DAYS` Tage nach dem Termin automatisch geleert. Der Termin selbst
bleibt ohne Personenbezug bestehen, damit Auslastung und Umsatz
nachvollziehbar bleiben. Buchhaltungsbelege unterliegen einer zehnjährigen
Aufbewahrungspflicht und gehören nicht in diese Anwendung.

---

## Sicherheit

| Angriff | Gegenmassnahme |
|---|---|
| SQL-Injection | Ausschliesslich gebundene Parameter über Drizzle; nirgends zusammengesetztes SQL |
| XSS | React maskiert jede Ausgabe, kein `dangerouslySetInnerHTML`; dazu CSP mit Einmalkennung pro Anfrage |
| Brute Force | 8 Fehlversuche je Adresse, danach Sperre mit wachsender Dauer; zusätzlich Zähler je Konto gegen verteilte Angriffe |
| Formularspam | Rechenaufgabe im Browser statt Bilderrätsel, dazu eine unsichtbare Formularfalle |
| Sitzungsdiebstahl | Cookie `HttpOnly`, `Secure`, `SameSite=Lax`; in der Datenbank liegt nur der Hash |
| CSRF | Next prüft bei jeder Server Action die Herkunft der Anfrage |
| Passwortdiebstahl | argon2id nach OWASP-Empfehlung; Passwörter sind nirgends lesbar |
| Rechteausweitung | Jede Seite und jede Aktion prüft die Berechtigung serverseitig, nicht nur die Navigation |

Gesperrt wird immer die **IP-Adresse**. Eine MAC-Adresse steht dem Server nicht
zur Verfügung — sie wird beim ersten Router ersetzt und erreicht das Internet
nie. Wer eine Sperre von Hand aufheben will:

```bash
docker compose exec db psql -U driveonpoint -c "delete from ip_blocks where ip = '203.0.113.42';"
```

### Wenn eine neue Seite dazukommt

Jede Seite unter `src/app` braucht `export const dynamic = "force-dynamic"`.
Die Inhaltsrichtlinie vergibt pro Anfrage eine neue Kennung für Skripte; eine
beim Bauen vorgerenderte Seite trüge eine veraltete, und der Browser würde
sämtliche Skripte blockieren. Im Layout allein wirkt die Zeile nicht.

---

## Entwicklung

```bash
npm install
cp .env.example .env          # DATABASE_URL auf die lokale Datenbank zeigen lassen
npm run db:setup
npm run dev
```

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Produktionsbau |
| `npm run typecheck` | Typen prüfen |
| `npm run db:generate` | Migration aus dem Schema erzeugen |
| `npm run db:setup` | Migrationen einspielen, Angebote und erstes Konto anlegen |

### Sicherung

```bash
docker compose exec -T db pg_dump -U driveonpoint driveonpoint | gzip > sicherung-$(date +%F).sql.gz
```

Täglich laufen lassen und die Kopien ausserhalb des Servers ablegen. Eine
Sicherung, die nie zurückgespielt wurde, ist keine Sicherung — einmal im Jahr
auf einem Testsystem ausprobieren.
