# Internet-Wetterstation

Ein free@home Addon, das Wetterdaten und Vorhersagen vom kostenlosen [Open-Meteo](https://open-meteo.com)-Dienst abruft und als virtuelle Wetterstationen im free@home-System bereitstellt.

## Funktionen

- Aktuelle Wetterdaten: Temperatur, Windgeschwindigkeit, Regen, Helligkeit
- Bis zu 5 Vorhersage-Tage, jeder als eigenes Wetterstation-Gerät
- Standortkonfiguration per Stadtname (automatisches Geocoding) oder GPS-Koordinaten
- Konfigurierbares Aktualisierungsintervall (1–60 Minuten)
- Automatischer Retry bei fehlgeschlagenem API-Abruf (nach 30 Sekunden)
- Kein API-Key erforderlich

## Konfigurationsparameter

| Parameter | Beschreibung | Standardwert |
|---|---|---|
| Stadt | Stadtname, z.B. `Berlin` | – |
| Breitengrad | GPS-Breitengrad (Alternative zur Stadt) | – |
| Längengrad | GPS-Längengrad (Alternative zur Stadt) | – |
| Aktualisierungsintervall | Abrufintervall in Minuten (1–60) | 15 |
| Vorhersage-Tage | Anzahl der Vorhersage-Tage (0–5), 0 = deaktiviert | 0 |

Stadt hat Vorrang vor Koordinaten, wenn beides angegeben ist.

## Geräte in free@home

Das Addon erstellt folgende virtuelle Geräte:

| Gerätename | Inhalt |
|---|---|
| Wetterstation | Aktuelle Wetterdaten |
| Wetterstation - Tag 1 | Vorhersage für morgen |
| Wetterstation - Tag 2 | Vorhersage für übermorgen |
| … | … |

Jedes Gerät hat vier Kanäle: **Temperatur**, **Wind**, **Regen**, **Helligkeit**.

Für Vorhersage-Tage wird die Tageshöchsttemperatur und der maximale Tageswind angezeigt.

## Entwicklung

### Voraussetzungen

- Node.js 18+
- Zugang zu einem free@home System Access Point

### Installation

```bash
npm install
```

### Bauen

```bash
npm run build
```

### Tests ausführen

```bash
npm test
```

Tests im Watch-Modus:

```bash
npm run test:watch
```

### Paket für Deployment erstellen

```bash
npm run pack
```

### Lokales Debugging

Kopiere `.vscode/launch.json.example` nach `.vscode/launch.json` und setze die Umgebungsvariablen:

```
FREEATHOME_BASE_URL=http://<IP-des-SysAP>
FREEATHOME_API_USERNAME=<Benutzername>
FREEATHOME_API_PASSWORD=<Passwort>
```

Anschließend in VS Code mit **F5** starten.

## Technische Details

### Datenquelle

Wetterdaten kommen von [Open-Meteo](https://open-meteo.com) – ein kostenloser, open-source Wetterdienst ohne API-Key.

| Open-Meteo-Feld | free@home-Kanal |
|---|---|
| `temperature_2m` | Temperatursensor |
| `windspeed_10m` | Windsensor |
| `precipitation` > 0 | Regensensor |
| `cloudcover` + `is_day` | Helligkeitssensor (geschätzt) |

**Helligkeitsschätzung** (Tageswerte):

| Bewölkung | Lux |
|---|---|
| < 25 % | 50 000 |
| 25–74 % | 20 000 |
| ≥ 75 % | 5 000 |
| Nacht | 0 |

### Projektstruktur

```
src/
  main.ts           – Addon-Einstiegspunkt, Geräteverwaltung, Konfiguration
  weatherUtils.ts   – Wetter-API, Geocoding, Hilffunktionen (testbar)
  weatherUtils.test.ts – Unit-Tests
fhstore/
  de.csv            – Deutsche Lokalisierung (Marketplace)
  en.csv            – Englische Lokalisierung (Marketplace)
  index.json        – Marketplace-Metadaten
free-at-home-metadata.json – Addon-Definition und Konfigurationsschema
```

## Lizenz

MIT
