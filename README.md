# Trailbox

Angular-Webanwendung mit passwortgeschütztem Dashboard, lokalem Personalplaner und CSV-Import-Checker.

## Personalplaner

Der Personalplaner verwaltet Trainings und Unterkurse, Personen, Anwesenheitsperioden, Mahlzeiten, Absenzen und billable person-nights. Sämtliche Planungsdaten liegen ausschliesslich in IndexedDB im jeweiligen Browser. JSON-Sicherungen können exportiert und wiederhergestellt werden; Küchenzahlen lassen sich als CSV exportieren oder drucken.

## Entwicklung

Voraussetzung: Node.js 20.19 oder neuer und pnpm.

```bash
pnpm install
pnpm start
```

## Passwort ändern

Das Klartextpasswort liegt nicht im Quellcode. Der gesalzene SHA-256-Hash wird in `public/app-settings.json` verwaltet:

```bash
pnpm password -- "ein-neues-sicheres-passwort"
```

Anschliessend neu bauen und veröffentlichen. Das initiale Passwort der ersten Veröffentlichung lautet `trailbox` und sollte geändert werden.

> Hinweis: Eine statische GitHub Page kann nur ein clientseitiges Zugangstor bieten. Da Quellcode und Einstellungen öffentlich ausgeliefert werden, ersetzt dies keine serverseitige Authentifizierung für vertrauliche Inhalte.

## CSV-Prüfung

Die Prüfung erfolgt ausschliesslich lokal im Browser. Geprüft werden unter anderem:

- UTF-8 und Semikolon-Trennung
- die 21 Spalten der offiziellen Vorlage in fester Reihenfolge
- maximal 200 Personen
- Pflichtfelder und maximale Feldlängen
- Datum, Geschlecht, AHV-Nr./PEID, Auswahlwerte, Land, Telefon und E-Mail

Ob eine Person bereits mit einer Organisation verknüpft ist, kann offline nicht ermittelt werden. Deshalb verlangt die Standardeinstellung für jede Zeile AHV-Nr. oder PEID. Für einen reinen Formatcheck kann `importChecker.requireIdentifier` in `public/app-settings.json` auf `false` gesetzt werden.

## Qualität und Build

```bash
pnpm test
pnpm build
```

Der Produktionsbuild verwendet den GitHub-Pages-Basispfad `/outdoor/`.
