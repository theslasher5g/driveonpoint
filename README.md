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
wählen, Name, Mailadresse und Telefonnummer angeben. Danach kommt eine Mail
mit einem Bestätigungslink (Double-Opt-In): der Termin ist bis dahin eine
Stunde lang reserviert und wird erst mit dem Klick verbindlich. Dann geht
die Bestätigung mit Absagelink und Kalenderdatei (.ics) raus, und rund einen
Tag vor dem Termin eine Erinnerung. Absagen funktioniert ohne Konto. Im Team
erfasste Termine sind sofort verbindlich. Nach einem Termin lässt er sich im
Kalender als „nicht erschienen“ markieren; die Buchhaltung führt ihn dann
wie eine kurzfristige Absage als verrechenbaren Ausfall.

**Team-Bereich** unter `/team`, verlinkt unauffällig im Fussbereich:

| Rolle | Darf |
|---|---|
| Administration | alles, inklusive Konten und Rollen |
| Leitung | Kalender aller Mitarbeitenden, Preise, Rabattaktionen |
| Fahrlehrer | Kalender ansehen, eigene Verfügbarkeit pflegen |

---

## Erste Inbetriebnahme

Vorausgesetzt: ein Server mit Docker und Docker Compose. Domain, Reverse
Proxy und Mailversand kommen **nicht** hier — die brauchst du erst, wenn die
Seite öffentlich gehen soll. Zum ersten Aufsetzen und Testen genügt das:

```bash
git clone <dieses Repository> driveonpoint
cd driveonpoint

cp .env.example .env
# Vier Geheimnisse erzeugen und in die .env eintragen:
openssl rand -base64 48   # POSTGRES_PASSWORD
openssl rand -base64 48   # SESSION_SECRET
openssl rand -base64 48   # CAPTCHA_SECRET
openssl rand -base64 48   # CRON_SECRET
# Dazu SEED_ADMIN_EMAIL und SEED_ADMIN_PASSWORD (mindestens 12 Zeichen).
# APP_URL, MAIL_DOMAIN und Google können vorerst leer bleiben — siehe unten.

docker compose up -d --build
docker compose logs -f app     # bis „Administrationskonto für … angelegt“ erscheint
```

Das startet nur `db` und `app`, nicht den Mail-Container — der ist ein
eigenes Compose-Profil und wird absichtlich übersprungen, solange keine
Domain für den Versand eingerichtet ist (siehe
[Mailversand](#mailversand)). Buchungen funktionieren auch ohne ihn, nur
ohne Bestätigungsmail.

Mehr ist zum Starten nicht nötig. Beim Hochfahren spielt die Anwendung die
Migrationen ein, legt die Angebote an und erzeugt beim allerersten Mal das
Administrationskonto aus `SEED_ADMIN_EMAIL` und `SEED_ADMIN_PASSWORD`.
Danach beide `SEED_ADMIN_*`-Zeilen in der `.env` **leeren** und
`docker compose up -d` erneut ausführen.

> Die Migration liegt vorgeneriert unter `drizzle/`. Bei Schemaänderungen
> `npm run db:generate` ausführen und die neue Datei mit einchecken — der
> Start spielt sie dann von selbst ein.

### Erster Blick, bevor eine Domain steht

Der Container hört nur auf `127.0.0.1` des Servers, nicht nach aussen — das
ist Absicht, siehe [Reverse Proxy](#reverse-proxy). Um vom eigenen Rechner
aus kurz hineinzuschauen, tunnle den Port per SSH, statt ihn am Server zu
öffnen:

```bash
ssh -L 3000:127.0.0.1:3000 dein-nutzer@dein-server
```

Danach ist die Seite unter `http://localhost:3000` auf dem eigenen Rechner
erreichbar, Tunnel offen lassen. Mit `APP_URL=http://localhost:3000` (der
Standardwert) meldet sich auch der Team-Bereich an: die Anwendung erkennt an
der fehlenden `https://`-Adresse, dass noch kein TLS davorsteht, und
verzichtet in diesem Fall auf das `Secure`-Attribut am Sitzungs-Cookie —
sonst würde der Browser es über reines HTTP gar nicht erst annehmen. Sobald
`APP_URL` auf eine `https://`-Adresse zeigt, greift der Schutz automatisch
wieder.

### Domain auf den Server zeigen lassen

Bei Infomaniak (oder jedem anderen Registrar) in der DNS-Verwaltung der
Domain einen `A`-Eintrag setzen: Name `@` (oder leer, je nach Oberfläche),
Wert die öffentliche IPv4-Adresse des Servers, auf dem `docker compose`
läuft. Für `www.driveonpoint.ch` zusätzlich einen `CNAME` auf
`driveonpoint.ch`, falls diese Adresse ebenfalls erreichbar sein soll. Die
Änderung braucht meist einige Minuten bis wenige Stunden, bis sie überall
gilt.

Das setzt einen Server mit öffentlicher IP voraus, auf dem diese Anwendung
bereits läuft (siehe [Erste Inbetriebnahme](#erste-inbetriebnahme)) — ein
reiner Domain-Kauf bei Infomaniak allein reicht nicht, die Domain muss auf
einen laufenden Server zeigen.

### Reverse Proxy

Der Reverse Proxy (Caddy) ist Teil von `docker-compose.yml` — keine
zusätzliche Installation auf dem Server nötig. Er holt sein
TLS-Zertifikat automatisch bei Let's Encrypt, sobald `SITE_ADDRESS` in der
`.env` auf die echte Domain zeigt und diese per DNS bereits auf den Server
verweist (siehe oben):

```
SITE_ADDRESS=driveonpoint.ch
APP_URL=https://driveonpoint.ch
```

und `docker compose up -d --build` erneut ausführen. Ohne `SITE_ADDRESS`
(Standardwert `:80`) hört Caddy nur auf Port 80 ohne TLS — genügt zum
ersten Testen, siehe [Erster Blick, bevor eine Domain
steht](#erster-blick-bevor-eine-domain-steht).

Das Sitzungs-Cookie bekommt ab jetzt automatisch das `Secure`-Attribut,
ohne dass sonst etwas geändert werden muss.

Wichtig: `TRUST_PROXY_HOPS` muss der Anzahl Proxys entsprechen. Bei einem
einzelnen Caddy oder nginx ist das `1`. Ein zu hoher Wert lässt sich mit einem
gefälschten `X-Forwarded-For` ausnutzen, um Sperren zu umgehen.

### Serverpflege: automatische Updates und Aufräumlauf

Drei wiederkehrende Aufgaben, alle unter `deploy/`. Einmalig einrichten,
laufen danach von selbst:

```bash
sudo deploy/server-updates.sh   # Sicherheitsupdates des Betriebssystems
sudo deploy/install-cron.sh     # Aufräumlauf + Docker-Image-Updates als Cron
```

**`server-updates.sh`** richtet `unattended-upgrades` ein (Debian/Ubuntu):
Sicherheitspatches des Betriebssystems werden automatisch eingespielt, ein
nötiger Neustart passiert nachts um vier — danach starten die Container von
selbst wieder, weil jeder Dienst in `docker-compose.yml` `restart:
unless-stopped` gesetzt hat. Nur die Sicherheits-Paketquelle ist aktiviert,
keine sonstigen Aktualisierungen. Protokoll unter
`/var/log/unattended-upgrades/`.

**`install-cron.sh`** trägt drei Zeilen in die crontab von root ein:

| Wann | Skript | Macht |
|---|---|---|
| stündlich, :07 | `deploy/stuendlich.sh` | Verschickt die Erinnerungen vor dem Termin und löscht Online-Buchungen, die nie bestätigt wurden |
| täglich 03:17 | `deploy/aufraeumen.sh` | Löscht Kundendaten nach Ablauf der Frist, entfernt abgelaufene Sitzungen und alte Zähler ([Aufbewahrung](#rechtliches)) |
| wöchentlich, So 04:00 | `deploy/docker-updates.sh` | Holt Sicherheitskorrekturen der Docker-Basisabbilder (siehe unten) |

Alle protokollieren nach `/var/log/driveonpoint-*.log`
(`install-cron.sh` richtet dafür auch gleich eine Log-Rotation ein). Läuft
etwas schief, zeigt sich das dort — ohne Mailversand-Einrichtung auf dem
Server verlässt sich nichts auf die stille Cron-Mail, die ohnehin oft
nirgendwo ankommt.

`docker-updates.sh` zieht `db` (Postgres) und `proxy` (Caddy) erneut in
derselben Version, aber mit dem, was seit dem letzten Pull an Patches
erschienen ist, und baut `app` mit `--pull` neu — das holt die aktuelle
`node:22-bookworm-slim`-Basis, während `npm ci` sich strikt an
`package-lock.json` hält. Es ändert sich also nur die Betriebssystemschicht
der Basis-Abbilder, nie der Anwendungscode: Ein `git pull` mit neuen
Funktionen bleibt bewusst eine manuelle Entscheidung, siehe [Wer was
ändert](#wer-was-ändert). Nutzt du den mitgelieferten Mail-Container
(`--profile mail`), wird er automatisch erkannt und mit aktualisiert.

Wer `install-cron.sh` schon vor dem stündlichen Lauf ausgeführt hat, führt es
nach dem Update einfach noch einmal aus — es ersetzt die alten Zeilen.

Von Hand ausführen und sofort das Ergebnis sehen:

```bash
sudo deploy/stuendlich.sh && sudo tail -5 /var/log/driveonpoint-stuendlich.log
sudo deploy/aufraeumen.sh && sudo tail -5 /var/log/driveonpoint-aufraeumen.log
sudo deploy/docker-updates.sh && sudo tail -20 /var/log/driveonpoint-docker-updates.log
```

---

## Mailversand

Standardmässig aus — ohne Domain lässt sich ohnehin keine Mail zustellen.
**Für Online-Buchungen ist der Mailversand aber Pflicht:** jede Buchung muss
über den Link in einer Mail bestätigt werden. Kann die Anwendung diese Mail
nicht verschicken, wird die Buchung sofort verworfen und das Formular zeigt
einen Hinweis mit der Telefonnummer. Im Team erfasste Termine funktionieren
auch ohne Mailversand.

Zwei Wege dahin — den mitgelieferten Postfix-Container selbst betreiben, oder
ein bestehendes Postfach bei einem Anbieter wie Infomaniak als Versandweg
benutzen. Für eine einzelne Fahrschule ist der zweite Weg deutlich weniger
Aufwand: kein eigener Mailserver, keine PTR-Einrichtung, und die
Zustellbarkeit hängt am Ruf des Anbieters statt am eigenen Server.

**Externes Postfach (z. B. Infomaniak kSuite) — empfohlen:**

1. In der `.env` `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` und `SMTP_PASS`
   eintragen — bei Infomaniak `SMTP_HOST=mail.infomaniak.com`,
   `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER`/`SMTP_PASS` wie im
   kSuite-Postfach eingerichtet (genauen Hostnamen in den
   kSuite-Mail-Einstellungen prüfen). `MAIL_FROM` und `MAIL_REPLY_TO` auf
   dasselbe Postfach setzen, etwa `DriveOnPoint <inbox@driveonpoint.ch>` —
   dann landet eine Antwort der Kundschaft direkt im selben Postfach, das
   ohnehin täglich geprüft wird.
2. `docker compose up -d --build` genügt — der mail-Container und
   `--profile mail` werden dann nicht gebraucht.

**Mitgelieferter Postfix-Container:**

1. In der `.env` `MAIL_DOMAIN`, `MAIL_HOSTNAME`, `MAIL_FROM` und
   `MAIL_REPLY_TO` eintragen.
2. Mit dem Profil starten, statt mit dem gewöhnlichen Befehl:
   ```bash
   docker compose --profile mail up -d --build
   ```
   (Jeder künftige Neustart braucht ebenfalls `--profile mail`, sonst bleibt
   der Mail-Container aus.)

Dieser Container sendet ausschliesslich und ist nur im internen Docker-Netz
erreichbar. Damit die Mails nicht im Spam landen, braucht die Domain drei
DNS-Einträge:

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

Ohne PTR-Eintrag lehnen viele Anbieter die Mails ab.

Zum Entwickeln fängt Mailpit alles ab, Weboberfläche auf
`http://localhost:8025`:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile mail up
```

---

## Zwei-Faktor-Authentifizierung (MFA)

Jede Person schaltet das selbst unter *Mein Konto* ein — keine Einrichtung
auf dem Server nötig. Ablauf: QR-Code mit einer Authenticator-App scannen
(Google Authenticator, Authy, 1Password oder jede andere, die den offenen
TOTP-Standard spricht), sechsstelligen Code bestätigen, acht
Wiederherstellungscodes einmalig notieren.

Läuft vollständig zwischen unserem Server und der App auf dem Gerät — es
wird nichts an einen fremden Dienst übertragen. Das Geheimnis liegt
verschlüsselt in der Datenbank (AES-256-GCM, Schlüssel aus `SESSION_SECRET`
abgeleitet), ein Datenbankleck allein reicht also nicht, um Codes zu
erzeugen. Wiederherstellungscodes werden nur als Hash gespeichert.

Beim Anmelden mit MFA gibt es nach dem Passwort noch keine echte Sitzung,
sondern nur ein signiertes, zehn Minuten gültiges Zwischen-Cookie, bis der
Code stimmt — ein gestohlenes Passwort allein reicht damit nicht.

**Gerät verloren?** Mit einem Wiederherstellungscode kommt man selbst wieder
hinein (Eingabefeld auf der Codeseite, Format `xxxxx-xxxxx`). Sind auch die
weg, setzt die Administration unter *Mitarbeitende* das MFA der Person
zurück — das meldet sie auf allen Geräten ab, sie richtet es danach neu ein.

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

**Verfügbarkeit** wird je Angebot eingetragen, nicht nur je Person: Jede
Mitarbeiterin hat für Nothilfekurs, VKU, Schnupperstunde und Fahrstunde ein
eigenes Wochenraster, weil sich die Zeiten stark unterscheiden — der VKU
findet praktisch immer abends statt, Fahrstunden eher tagsüber. Einzelne
Ausnahmetage (Ferien, ein zusätzlicher Termin) gelten dagegen standardmässig
für alle Angebote einer Person und lassen sich beim Eintragen optional auf
ein einzelnes Angebot eingrenzen.

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
| Bekannte Sicherheitslücken im Unterbau | Automatische Sicherheitsupdates für Betriebssystem und Docker-Basisabbilder, siehe [Serverpflege](#serverpflege-automatische-updates-und-aufräumlauf) |

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
